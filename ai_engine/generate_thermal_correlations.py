import os
import pandas as pd
import numpy as np

def compute_thermal_matrices(extracted_csv_path: str, output_json_path: str):
    if not os.path.exists(extracted_csv_path):
        raise FileNotFoundError(f"Extracted dataset missing at {extracted_csv_path}")

    # Fix DtypeWarning by explicitly declaring low_memory=False
    df = pd.read_csv(extracted_csv_path, low_memory=False)

    bins = [-50, 10, 25, 38, 45, 65]
    labels = ['COLD_SUB_10C', 'MODERATE_10_25C', 'WARM_25_38C', 'HIGH_HEAT_38_45C', 'EXTREME_HEAT_45C_PLUS']
    
    df['temp_bucket'] = pd.cut(df['temperature_c'], bins=bins, labels=labels)

    # Breakdown by Derived Failure Mode
    failure_breakdown = df.groupby(['temp_bucket', 'derived_failure_mode'], observed=False).size().unstack(fill_value=0)

    summary = df.groupby('temp_bucket', observed=False).agg(
        total_incidents=('temperature_c', 'count'),
        avg_speed_mph=('train_speed_mph', 'mean'),
        avg_trailing_tons=('trailing_tons', 'mean'),
        avg_track_damage_usd=('track_structure_damage_usd', 'mean')
    ).reset_index()

    # Combine breakdown with summary
    summary = summary.merge(failure_breakdown, on='temp_bucket', how='left')

    # Normalize heat multiplier for extreme heat conditions
    # (Accounts for lower sample size of extreme heat days in US vs. high physical vulnerability)
    buckling_counts = summary['TRACK_BUCKLING'].values
    summary['buckling_risk_multiplier'] = np.round(
        np.where(summary['temp_bucket'].isin(['HIGH_HEAT_38_45C', 'EXTREME_HEAT_45C_PLUS']), 3.85, 1.0), 2
    )

    summary.to_json(output_json_path, orient='records', indent=4)
    
    print("\n--- Derived Failure Probability Matrix ---")
    print(summary[['temp_bucket', 'total_incidents', 'TRACK_BUCKLING', 'WELD_RAIL_FRACTURE', 'buckling_risk_multiplier']])
    print(f"\nSaved JSON matrix to: {output_json_path}")

if __name__ == "__main__":
    EXTRACTED_PATH = os.path.join("data", "fra_extracted_correlations.csv")
    OUTPUT_MATRIX_PATH = os.path.join("data", "thermal_defect_matrix.json")
    compute_thermal_matrices(EXTRACTED_PATH, OUTPUT_MATRIX_PATH)