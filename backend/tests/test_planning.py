from concurrent.futures import ThreadPoolExecutor
from datetime import date, time
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.api.endpoints.planner import router
from app.core.gap_finder import GapFinder
from app.core.operations_store import OperationStore
from app.core.planning_service import analyze, commit
from app.core.timetable_engine import TimetableEngine
from app.models.enums import TrackLine
from app.models.schemas import BlockRequest, Train, TrainStop


def train(number='1', stops=None, days=None):
    stops = stops or [('BRC', '12:00', '12:00', 1), ('ST', '13:00', '13:00', 1)]
    return Train(number=number, name=f'Train {number}', category='EXPRESS',
        from_station_code=stops[0][0], to_station_code=stops[-1][0], running_days=days or [],
        route=[TrainStop(sno=i, station_code=code, station_name=code, arrival=time.fromisoformat(arr),
            departure=time.fromisoformat(dep), day=day, distance_km=i * 50)
            for i, (code, arr, dep, day) in enumerate(stops)])


def bundle(trains=()):
    stations = [SimpleNamespace(code=code, cumulative_km=km, lat=22 - i, lon=73)
                for i, (code, km) in enumerate([('BRC', 0), ('MID', 50), ('ST', 100)])]
    network = SimpleNamespace(corridors={'WEST': SimpleNamespace(stations=stations)},
        station_leg_index={s.code: [('WEST', i)] for i, s in enumerate(stations)},
        get_track_segment=lambda a, b: [[73, 22], [73, 20]])
    engine = TimetableEngine()
    engine.load_trains(list(trains))
    engine.corridor_km_maps = {'WEST': {s.code: s.cumulative_km for s in stations}}
    return SimpleNamespace(network=network, timetable=engine)


def request(**changes):
    args = dict(from_station='BRC', to_station='ST', track_line='UP', requested_time='12:00',
        duration_minutes=30, department='TMS', criticality='NORMAL', operation_date='2026-07-06',
        weather={'mode': 'clear'})
    args.update(changes)
    return BlockRequest(**args)


@pytest.fixture
def store():
    value = OperationStore(':memory:')
    yield value
    value.close()


def query(b, start, end, a='BRC', z='ST', line=TrackLine.UP, day=None):
    return b.timetable.find_sector_trains_in_window('WEST', line, a, z, start, end,
        b.timetable.corridor_km_maps['WEST'], day)


def test_skip_stop_interpolation_and_direction():
    b = bundle([train()])
    result = query(b, 750, 760, 'MID', 'ST')
    assert [(c.pass_entry_min, c.pass_exit_min) for c in result] == [(750, 780)]
    assert query(b, 750, 760, line=TrackLine.DOWN) == []


def test_partial_hops_do_not_extrapolate_and_include_dwell():
    b = bundle([train(stops=[('BRC', '12:00', '12:00', 1), ('MID', '12:20', '12:40', 1), ('ST', '13:00', '13:00', 1)])])
    result = query(b, 745, 750)
    assert len(result) == 1
    assert (result[0].pass_entry_min, result[0].pass_exit_min) == (720, 780)
    assert not query(b, 710, 720)
    assert not query(b, 780, 790)


def test_midnight_and_service_origin_weekday():
    b = bundle([train(stops=[('BRC', '23:50', '23:50', 1), ('ST', '00:30', '00:30', 2)], days=['Monday'])])
    monday = date(2026, 7, 6)
    result = query(b, 1435, 1460, day=monday)
    assert (result[0].pass_entry_min, result[0].pass_exit_min) == (1430, 1470)
    result = query(b, 0, 20, day=date(2026, 7, 7))
    assert (result[0].pass_entry_min, result[0].pass_exit_min) == (-10, 30)
    assert not query(b, 0, 20, day=monday)


def test_gap_and_preview_share_sector_occupancy():
    b = bundle([train()])
    gaps = GapFinder(b.timetable).all_gaps('WEST', TrackLine.UP, 'MID', 'ST', 700, 800)
    assert [(g.start_min, g.end_min) for g in gaps] == [(700, 750), (780, 800)]


def test_persistence_csv_by_operation_date_and_close(tmp_path):
    path = tmp_path / 'operations.sqlite3'
    s = OperationStore(path)
    op = s.record(department='TMS', corridor='WEST', from_station='BRC', to_station='ST', start_time='12:00',
        duration_minutes=30, operation_date='2025-03-01', impacted_trains=['123'])
    s.close()
    s = OperationStore(path)
    assert s.list()[0]['block_id'] == op.block_id
    assert op.block_id in s.monthly_csv(3, 2025)
    assert op.block_id not in s.monthly_csv(4, 2025)
    assert s.close_operation(op.block_id)
    assert s.list()[0]['status'] == 'CLOSED'
    s.close()


def test_month_region_weather_and_shared_tasks(store):
    req = request(weather={'mode': 'seasonal'}, shared_tasks=[{'department': 'SMMS', 'duration_minutes': 60}])
    sequential = analyze(req, bundle(), store)
    assert sequential.planning['effective_duration_minutes'] == 113  # ceil(90 * 1.25)
    parallel = analyze(req.model_copy(update={'parallel_work_confirmed': True}), bundle(), store)
    assert parallel.planning['effective_duration_minutes'] == 75
    assert parallel.planning['shared_minutes_saved'] == 30
    dry = analyze(request(operation_date='2026-01-06', weather={'mode': 'seasonal'}), bundle(), store)
    assert dry.planning['effective_duration_minutes'] == 30


def test_wind_restriction_rejects_commit_and_preserves_timetable(store):
    b = bundle([train()])
    req = request(department='TDMS', weather={'mode': 'high_wind'}, criticality='EMERGENCY')
    decision = analyze(req, b, store)
    assert decision.status.value == 'PENDING_REVIEW'
    assert decision.planning['weather']['restricted']
    with pytest.raises(HTTPException) as exc:
        commit(req, b, store)
    assert exc.value.status_code == 409
    assert not store.list()
    assert len(b.timetable.trains) == 1


def test_weather_shift_changes_occupancy_and_fifo_comparison(store):
    b = bundle([train(stops=[('BRC', '12:10', '12:10', 1), ('ST', '12:20', '12:20', 1)])])
    decision = analyze(request(criticality='MAJOR', weather={'mode': 'heavy_rain'}), b, store)
    row = next(r for r in decision.planning['comparison'] if r['scheduled_entry_min'] == 730)
    assert row['without_block_entry_min'] == 745
    assert row['with_block_entry_min'] == 770  # 45-min adjusted work + 5-min buffer
    assert row['block_delay_minutes'] == 25
    assert row['total_delay_minutes'] == 40


def test_resource_shortage_is_not_approved(store):
    req = request(resource_capacity={'TMS_crew': 0, 'SMMS_crew': 2, 'TDMS_crew': 2, 'equipment_sets': 3, 'vehicles': 2})
    decision = analyze(req, bundle(), store)
    assert decision.status.value == 'PENDING_REVIEW'
    assert any(not r['sufficient'] for r in decision.planning['resources'])


def test_inside_train_is_not_retroactively_held(store):
    b = bundle([train()])
    decision = analyze(request(requested_time='12:10', criticality='MAJOR'), b, store)
    assert decision.status.value == 'PENDING_REVIEW'
    assert 'retroactively' in decision.notes
    assert decision.planning['evaluation']['delay_minutes_saved'] is None


def test_normal_selects_nearest_clearance_gap_and_explains(store):
    b = bundle([train()])
    decision = analyze(request(requested_time='12:45'), b, store)
    assert decision.block_window['start'] == time(13, 5)
    assert decision.status.value == 'APPROVED'
    assert decision.planning['explanations']


def test_overnight_reservations_release_on_close(store):
    b = bundle()
    first = commit(request(requested_time='23:50', criticality='MAJOR'), b, store)
    next_day = request(operation_date='2026-07-07', requested_time='00:05', criticality='MAJOR')
    assert analyze(next_day, b, store).status.value == 'PENDING_REVIEW'
    store.close_operation(first['block_id'])
    assert analyze(next_day, b, store).status.value == 'APPROVED'


def test_commit_race_reserves_only_once_and_rollback_works(store):
    b = bundle()
    def attempt(_):
        try:
            return commit(request(criticality='MAJOR'), b, store)['committed']
        except HTTPException:
            return False
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(attempt, range(2))) == [False, True]
    assert len(store.list()) == 1


def test_stale_preview_does_not_silently_commit_a_different_window(store):
    b = bundle()
    req = request()
    preview = analyze(req, b, store)
    commit(req, b, store)
    with pytest.raises(HTTPException, match='Availability changed'):
        commit(req.model_copy(update={'expected_start_iso': preview.planning['start_iso']}), b, store)
    assert len(store.list()) == 1


def test_http_preview_validation_commit_history_and_replay(store):
    app = FastAPI()
    app.include_router(router)
    app.state.gq_bundle, app.state.operation_store = bundle(), store
    with TestClient(app) as client:
        prefix = '/api/v1/planner'
        assert client.get(prefix + '/preview-traffic', params={'from_station': 'BRC', 'to_station': 'ST', 'requested_time': 'bad'}).status_code == 422
        assert client.get(prefix + '/preview-traffic', params={'from_station': 'BRC', 'to_station': 'ST', 'requested_time': '12:00'}).status_code == 200
        payload = request().model_dump(mode='json')
        result = client.post(prefix + '/commit-block', json=payload)
        assert result.status_code == 200, result.text
        block_id = result.json()['block_id']
        assert len(client.get(prefix + '/operations').json()) == 1
        replay = client.post(prefix + f'/operations/{block_id}/evaluate')
        assert replay.status_code == 200
        assert replay.json()['replay']['feasible']
        assert client.post(prefix + f'/operations/{block_id}/close').status_code == 200
        assert client.get(prefix + '/operations').json()[0]['status'] == 'CLOSED'


def test_duplicate_department_rejected(store):
    with pytest.raises(HTTPException):
        analyze(request(shared_tasks=[{'department': 'TMS', 'duration_minutes': 20}]), bundle(), store)
