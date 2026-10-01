"""Explicit seasonal/scenario assumptions, never a live-weather safety clearance."""
from math import ceil

SOURCE = 'https://imdpune.gov.in/climinfo/season/mon/index.html'


def assess_weather(req, stations, base_duration, departments):
    # Coarse geographic envelope for the prototype, not administrative polygons.
    western = any(16 <= s.lat <= 24.8 and 68 <= s.lon <= 76.5 for s in stations)
    monsoon = western and req.operation_date.month in (6, 7, 8, 9)
    mode = req.weather.mode
    condition = ('monsoon' if monsoon else 'unspecified') if mode == 'seasonal' else mode
    factors = {'monsoon': 1.25, 'heavy_rain': 1.5, 'high_wind': 1.3, 'severe': 1.75}
    factor = factors.get(condition, 1.0)
    train_delay = {'monsoon': 5, 'heavy_rain': 15, 'high_wind': 8, 'severe': 25}.get(condition, 0)
    restricted = condition == 'severe' or (condition == 'high_wind' and (req.weather.exposed_work or 'TDMS' in departments))
    return {
        'mode': mode, 'condition': condition, 'region': 'Western India / Maharashtra–Gujarat envelope' if western else 'Outside configured seasonal region',
        'month': req.operation_date.month, 'duration_multiplier': factor,
        'base_duration_minutes': base_duration, 'adjusted_duration_minutes': ceil(base_duration * factor),
        'train_delay_minutes': train_delay, 'restricted': restricted,
        'reason': 'Defer severe-weather work; high-wind exposed/traction work needs a reviewed window.' if restricted else 'Work duration and train arrivals adjusted using the selected scenario.',
        'source_url': SOURCE, 'basis': 'Seasonal scenario, not a forecast. IMD supports June–September season only; multipliers and delays are illustrative, not railway limits. No monthly wind climatology is configured; select a high-wind scenario explicitly.',
    }
