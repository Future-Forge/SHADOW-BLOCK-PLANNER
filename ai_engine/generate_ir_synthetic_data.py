import os
import json
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

def generate_ir_datasets():
    # Setup Paths
    matrix_path = os.path.join("data", "thermal_defect_matrix.json")
    output_dir = os.path.join("data", "processed_ir")
    os.makedirs(output_dir, exist_ok=True)

    if not os.path.exists(matrix_path):
        raise FileNotFoundError(f"Missing thermal matrix at {matrix_path}")

    with open(matrix_path, "r") as f:
        thermal_matrix = json.load(f)

    # Convert matrix to dictionary lookup
    matrix_dict = {item['temp_bucket']: item for item in thermal_matrix}

    print("Generating Indian Railways Golden Quadrilateral Datasets...")

    # Configuration Parameters
    np.random.seed(42)
    n_samples_per_dept = 600

    # GQ Corridor Sections & Zone Mapping
    gq_sections = [
        {"corridor": "Delhi-Mumbai", "code": "DM", "zone": "NWR-WR", "avg_temp_c": 41.5, "bucket": "HIGH_HEAT_38_45C"},
        {"corridor": "Delhi-Howrah", "code": "DH", "zone": "NCR-ER", "avg_temp_c": 28.0, "bucket": "WARM_25_38C"},
        {"corridor": "Howrah-Chennai", "code": "HC", "zone": "ECoR-SR", "avg_temp_c": 33.5, "bucket": "WARM_25_38C"},
        {"corridor": "Mumbai-Chennai", "code": "MC", "zone": "CR-SCR", "avg_temp_c": 22.0, "bucket": "MODERATE_10_25C"}
    ]

    block_sections = ["NDLS-MTJ", "MTJ-KOTA", "KOTA-RMA", "RMA-BRC", "BRC-MMCT", 
                      "CNB-PRYJ", "DDU-ASN", "HWH-KGP", "BZA-MAS", "SUR-PUNE"]

    base_time = datetime(2026, 10, 1, 6, 0, 0)

    # -------------------------------------------------------------
    # 1. TMS (Track Management System - Engineering Dept)
    # -------------------------------------------------------------
    tms_rows = []
    for i in range(n_samples_per_dept):
        sec = np.random.choice(gq_sections)
        bucket_stats = matrix_dict.get(sec["bucket"], matrix_dict["WARM_25_38C"])
        
        # Determine defect type weighted by extracted physics matrix
        defect_type = np.random.choice(
            ["Sun Kink/Track Buckling", "Weld Fracture", "Track Creep", "Ballast Pounding"],
            p=[0.45, 0.25, 0.15, 0.15] if sec["bucket"] in ["HIGH_HEAT_38_45C", "EXTREME_HEAT_45C_PLUS"] else [0.15, 0.40, 0.25, 0.20]
        )
        
        urgency = "CRITICAL" if defect_type in ["Sun Kink/Track Buckling", "Weld Fracture"] else np.random.choice(["HIGH", "MEDIUM"], p=[0.6, 0.4])
        block_hrs = 3.5 if urgency == "CRITICAL" else np.random.choice([1.5, 2.0, 2.5], p=[0.3, 0.5, 0.2])

        tms_rows.append({
            "defect_id": f"TMS-{sec['code']}-{i+1001:04d}",
            "gq_corridor": sec["corridor"],
            "railway_zone": sec["zone"],
            "block_section": np.random.choice(block_sections),
            "track_km": np.round(np.random.uniform(10.0, 1300.0), 2),
            "defect_type": defect_type,
            "urgency_level": urgency,
            "ambient_temp_c": sec["avg_temp_c"] + np.round(np.random.uniform(-2.0, 3.5), 1),
            "required_block_hours": block_hrs,
            "logged_timestamp": (base_time + timedelta(hours=np.random.randint(1, 168))).strftime("%Y-%m-%d %H:%M:%S")
        })
    
    tms_df = pd.DataFrame(tms_rows)
    tms_df.to_csv(os.path.join(output_dir, "TMS_Track_Defects.csv"), index=False)

    # -------------------------------------------------------------
    # 2. SMMS (Signalling Maintenance System)
    # -------------------------------------------------------------
    smms_rows = []
    for i in range(n_samples_per_dept):
        sec = np.random.choice(gq_sections)
        asset = np.random.choice(["Point Machine", "Axle Counter", "Track Circuit", "Relay Interlocking"])
        urgency = "CRITICAL" if asset in ["Point Machine", "Axle Counter"] else "HIGH"

        smms_rows.append({
            "defect_id": f"SMS-{sec['code']}-{i+2001:04d}",
            "gq_corridor": sec["corridor"],
            "station_code": np.random.choice(["NDLS", "KOTA", "BRC", "MMCT", "CNB", "HWH", "MAS"]),
            "asset_type": asset,
            "failure_mode": "Signal Insulation Failure" if sec["corridor"] == "Howrah-Chennai" else "Mechanical Jam / Glitch",
            "urgency_level": urgency,
            "required_block_hours": np.random.choice([1.0, 1.5, 2.0], p=[0.4, 0.4, 0.2]),
            "logged_timestamp": (base_time + timedelta(hours=np.random.randint(1, 168))).strftime("%Y-%m-%d %H:%M:%S")
        })

    smms_df = pd.DataFrame(smms_rows)
    smms_df.to_csv(os.path.join(output_dir, "SMMS_Signal_Defects.csv"), index=False)

    # -------------------------------------------------------------
    # 3. TDMS (Traction Distribution Management System - Electrical)
    # -------------------------------------------------------------
    tdms_rows = []
    for i in range(n_samples_per_dept):
        sec = np.random.choice(gq_sections)
        defect = "OHE Wire Sagging" if sec["avg_temp_c"] > 38.0 else np.random.choice(["Insulator Flashover", "Cantilever Adjustment", "Neutral Section Inspection"])
        
        tdms_rows.append({
            "defect_id": f"TDM-{sec['code']}-{i+3001:04d}",
            "gq_corridor": sec["corridor"],
            "ohe_sector_id": f"OHE-{sec['code']}-{np.random.randint(101, 199)}",
            "defect_type": defect,
            "urgency_level": "CRITICAL" if defect == "OHE Wire Sagging" else "MEDIUM",
            "required_block_hours": np.random.choice([1.5, 2.0, 3.0], p=[0.3, 0.5, 0.2]),
            "logged_timestamp": (base_time + timedelta(hours=np.random.randint(1, 168))).strftime("%Y-%m-%d %H:%M:%S")
        })

    tdms_df = pd.DataFrame(tdms_rows)
    tdms_df.to_csv(os.path.join(output_dir, "TDMS_Traction_Defects.csv"), index=False)

    # -------------------------------------------------------------
    # 4. COA (Control Office Application - Timetable & Goods Forecast)
    # -------------------------------------------------------------
    coa_rows = []
    train_types = ["PREMIUM_PASSENGER", "EXPRESS_PASSENGER", "FREIGHT_CONTAINER", "FREIGHT_COAL"]
    
    for i in range(1000):
        sec = np.random.choice(gq_sections)
        t_type = np.random.choice(train_types, p=[0.2, 0.3, 0.3, 0.2])
        entry = base_time + timedelta(hours=i * 0.25)
        exit_t = entry + timedelta(minutes=np.random.randint(25, 60))
        
        coa_rows.append({
            "slot_id": f"COA-GQ-{i+5001:05d}",
            "gq_corridor": sec["corridor"],
            "block_section": np.random.choice(block_sections),
            "train_number": f"{np.random.randint(12000, 22000)}" if "PASSENGER" in t_type else f"G-{np.random.randint(800, 999)}",
            "train_type": t_type,
            "scheduled_entry": entry.strftime("%Y-%m-%d %H:%M:%S"),
            "scheduled_exit": exit_t.strftime("%Y-%m-%d %H:%M:%S"),
            "natural_gap_minutes": np.random.choice([30, 45, 90, 180, 240], p=[0.2, 0.3, 0.3, 0.1, 0.1])
        })

    coa_df = pd.DataFrame(coa_rows)
    coa_df.to_csv(os.path.join(output_dir, "COA_Train_Timetable.csv"), index=False)

    print(f"Generated IR Datasets in `{output_dir}/`:")
    print(f" - TMS:  {len(tms_df)} records")
    print(f" - SMMS: {len(smms_df)} records")
    print(f" - TDMS: {len(tdms_df)} records")
    print(f" - COA:  {len(coa_df)} train slots")

if __name__ == "__main__":
    generate_ir_datasets()