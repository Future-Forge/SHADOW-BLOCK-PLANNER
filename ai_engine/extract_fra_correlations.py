import os
import pandas as pd
import numpy as np

def extract_fra_correlations(input_csv_path: str, output_csv_path: str):
    if not os.path.exists(input_csv_path):
        raise FileNotFoundError(f"Source file not found at: {input_csv_path}")

    print(f"Reading raw FRA dataset from {input_csv_path}...")
    df = pd.read_csv(input_csv_path, low_memory=False)
    df.columns = df.columns.str.strip().str.upper()

    column_variants = {
        'accident_type_code': ['TYPE', 'ACCIDENT TYPE CODE', 'ACCIDENT TYPE'],
        'temperature_f': ['TEMP', 'TEMPERATURE', 'TEMPERATURE (F)'],
        'visibility_code': ['VISIBLTY', 'VISIBILITY CODE', 'VISIBILITY'],
        'weather_code': ['WEATHER', 'WEATHER CONDITION CODE', 'WEATHER CONDITION'],
        'track_type_code': ['TYPTRK', 'TRACK TYPE CODE', 'TRACK TYPE'],
        'fra_track_class': ['TRKCLAS', 'FRA TRACK CLASS', 'TRACK CLASS'],
        'annual_track_density_mgt': ['TRKDNST', 'ANNUAL TRACK DENSITY', 'TRACK DENSITY'],
        'equipment_type_code': ['TYPEQ', 'EQUIPMENT TYPE CODE', 'EQUIPMENT TYPE'],
        'train_speed_mph': ['TRNSPD', 'TRAIN SPEED', 'SPEED', 'TRAIN SPEED (MPH)'],
        'trailing_tons': ['TONS', 'TRAILING TONS', 'GROSS TONNAGE'],
        'signalization_code': ['SIGNAL', 'SIGNALIZATION CODE', 'SIGNALIZATION'],
        'equipment_damage_usd': ['EQPDMG', 'EQUIPMENT DAMAGE', 'EQUIPMENT DAMAGE COST'],
        'track_structure_damage_usd': ['TRKDMG', 'TRACK DAMAGE', 'TRACK STRUCTURE DAMAGE', 'TRACK, SIGNAL, WAY DAMAGE'],
        'primary_cause_code': ['CAUSE', 'PRIMARY ACCIDENT CAUSE CODE', 'PRIMARY CAUSE', 'ACCIDENT CAUSE CODE'],
        'primary_cause_desc': ['PRIMARY ACCIDENT CAUSE', 'ACCIDENT CAUSE'],
        'contributing_cause_code': ['CAUS2', 'CONTRIBUTING ACCIDENT CAUSE CODE', 'CONTRIBUTING CAUSE'],
        'narrative_description': ['NARRATIVE', 'NARRATIVE DESCRIPTION', 'DESCRIPTION', 'NARR1', 'NARR2']
    }

    extracted_data = {}
    for target_col, variants in column_variants.items():
        found = False
        for var in variants:
            if var in df.columns:
                extracted_data[target_col] = df[var]
                found = True
                break
        if not found:
            extracted_data[target_col] = np.nan

    extracted_df = pd.DataFrame(extracted_data)

    # Temperature Conversion
    extracted_df['temperature_f'] = pd.to_numeric(extracted_df['temperature_f'], errors='coerce')
    extracted_df['temperature_c'] = np.round((extracted_df['temperature_f'] - 32) * 5 / 9, 1)

    # Extract Failure Mode from Narrative using Regex NLP
    narrative_text = extracted_df['narrative_description'].astype(str).str.upper()
    
    conditions = [
        narrative_text.str.contains('SUN KINK|BUCKL|HEAT|EXPANSION|THERMAL', regex=True, na=False),
        narrative_text.str.contains('WELD|FRACTURE|BROKEN RAIL|JOINT', regex=True, na=False),
        narrative_text.str.contains('SIGNAL|SWITCH|INTERLOCK|RELAY|CIRCUIT', regex=True, na=False),
        narrative_text.str.contains('POWER|OVERHEAD|CATENARY|WIRE|TRACTION', regex=True, na=False)
    ]
    choices = ['TRACK_BUCKLING', 'WELD_RAIL_FRACTURE', 'SIGNAL_FAILURE', 'TRACTION_OHE_FAILURE']
    extracted_df['derived_failure_mode'] = np.select(conditions, choices, default='OTHER_INFRASTRUCTURE')

    # Filter Infrastructure Defects
    if 'primary_cause_code' in extracted_df.columns:
        extracted_df['primary_cause_code'] = extracted_df['primary_cause_code'].astype(str).str.strip()
        infrastructure_mask = (
            extracted_df['primary_cause_code'].str.startswith(('T', 'S', 'E', 't', 's', 'e'), na=False) |
            (extracted_df['derived_failure_mode'] != 'OTHER_INFRASTRUCTURE')
        )
        extracted_df = extracted_df[infrastructure_mask]

    numeric_fields = ['train_speed_mph', 'trailing_tons', 'equipment_damage_usd', 'track_structure_damage_usd', 'annual_track_density_mgt']
    for field in numeric_fields:
        extracted_df[field] = pd.to_numeric(extracted_df[field], errors='coerce').fillna(0)

    extracted_df.to_csv(output_csv_path, index=False)
    print(f"\n--- Processed {len(extracted_df)} records with Narrative Text NLP ---")

if __name__ == "__main__":
    RAW_DATA_PATH = os.path.join("data", "USFRA_Dataset.csv")
    OUTPUT_DATA_PATH = os.path.join("data", "fra_extracted_correlations.csv")
    extract_fra_correlations(RAW_DATA_PATH, OUTPUT_DATA_PATH)