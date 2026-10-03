from types import SimpleNamespace
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.api.endpoints.live_map import router
from app.models.schemas import LiveTrainState


def test_snapshot_labels_source_and_does_not_truncate_train_count():
    app = FastAPI()
    app.include_router(router)
    app.state.gq_bundle = SimpleNamespace(network=SimpleNamespace(corridors={'WEST': {}, 'EAST_COAST': {}}), timetable={})
    trains = [LiveTrainState(train_number=str(i), train_name='Test', category='EXPRESS', lat=20, lon=72,
        current_section='BRC-ST', track_line='UP', speed_kmph=70, status='RUNNING', corridor_leg='WEST') for i in range(120)]
    trains.append(trains[0].model_copy(update={'train_number':'outside','corridor_leg':None}))
    with patch('app.api.endpoints.live_map.compute_live_trains', return_value=trains):
        with TestClient(app) as client:
            response = client.get('/api/v1/trains/snapshot?time=12:30:00')
            assert response.status_code == 200
            data = response.json()
            assert data['source'] == 'TIMETABLE_SIMULATION'
            assert data['total'] == len(data['trains']) == 120
            assert data['corridor_counts'] == {'WEST':120, 'EAST_COAST':0}
            assert data['simulation_time'] == '12:30:00'
            assert client.get('/api/v1/trains/snapshot?time=not-time').status_code == 422
