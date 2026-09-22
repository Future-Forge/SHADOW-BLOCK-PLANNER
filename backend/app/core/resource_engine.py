"""
Indian Railways Block Planning: Intelligent Resource & Manpower Allocation Engine.
Calculates dynamic equipment checklists and certified crew deployment matrices
scaled by track length and geographic environmental conditions (Golden Quadrilateral).
"""
import math
from typing import Dict, Any, List


def calculate_resources(
    department: str,
    defect_type: str,
    corridor_arm: str,
    length_km: float,
) -> Dict[str, Any]:
    """
    Computes baseline defect equipment, applies Golden Quadrilateral environmental modifiers,
    and scales consumables/manpower linearly with block length.
    """
    norm_length = max(0.2, float(length_km))
    extra_km = max(0.0, norm_length - 1.0)
    
    # -------------------------------------------------------------------------
    # 1. Environmental Hazard Mapping by Golden Quadrilateral Corridor Arm
    # -------------------------------------------------------------------------
    arm_upper = corridor_arm.upper()
    if "WEST" in arm_upper:
        hazard_badge = "EXTREME THERMAL EXPANSION (RAIL TEMP > 65°C)"
        severity = "RED"
        climate_equipment = [
            {
                "id": "EQ-ENV-W01",
                "name": "Infrared Digital Rail Thermometer (PRTG)",
                "category": "Safety/Climate Gear",
                "requiredQty": 2,
                "unit": "units",
                "isMandatory": True,
            },
            {
                "id": "EQ-ENV-W02",
                "name": "Low-Friction Rail De-Stressing Rollers",
                "category": "Tools",
                "requiredQty": 20 + int(math.ceil(norm_length * 15)),
                "unit": "nos",
                "isMandatory": True,
            },
            {
                "id": "EQ-ENV-W03",
                "name": "Electrolyte Hydration & Heat Stress Mitigation Packs",
                "category": "Safety/Climate Gear",
                "requiredQty": 10 + int(math.ceil(norm_length * 8)),
                "unit": "kits",
                "isMandatory": True,
            },
        ]
    elif "GANG" in arm_upper or "NORTH" in arm_upper:
        hazard_badge = "DENSE FOG HAZARD & COLD EMBRITTLEMENT (VISIBILITY < 50m)"
        severity = "RED"
        climate_equipment = [
            {
                "id": "EQ-ENV-G01",
                "name": "Digital USFD Double Rail Tester (RDSO Approved)",
                "category": "Tools",
                "requiredQty": 1,
                "unit": "units",
                "isMandatory": True,
            },
            {
                "id": "EQ-ENV-G02",
                "name": "Audible Fog Safety Detonators (Patakhas)",
                "category": "Safety/Climate Gear",
                "requiredQty": 24,
                "unit": "nos",
                "isMandatory": True,
            },
            {
                "id": "EQ-ENV-G03",
                "name": "High-Lumen LED Fog Navigation & Worksite Flashers",
                "category": "Safety/Climate Gear",
                "requiredQty": 4 + int(math.ceil(extra_km * 2)),
                "unit": "units",
                "isMandatory": True,
            },
            {
                "id": "EQ-ENV-G04",
                "name": "Insulated Thermal Workwear Sets",
                "category": "Safety/Climate Gear",
                "requiredQty": 5 + int(math.ceil(norm_length * 2)),
                "unit": "kits",
                "isMandatory": True,
            },
        ]
    elif "COAST" in arm_upper or "EAST" in arm_upper:
        hazard_badge = "SALINE CORROSION & MONSOON MOISTURE INFILTRATION"
        severity = "AMBER"
        climate_equipment = [
            {
                "id": "EQ-ENV-C01",
                "name": "Marine Grade Anti-Corrosive Fishplate Fasteners",
                "category": "Tools",
                "requiredQty": 30 + int(math.ceil(norm_length * 20)),
                "unit": "nos",
                "isMandatory": True,
            },
            {
                "id": "EQ-ENV-C02",
                "name": "25kV Digital Insulation Leakage & Earth Resistance Tester",
                "category": "Tools",
                "requiredQty": 2,
                "unit": "units",
                "isMandatory": True,
            },
            {
                "id": "EQ-ENV-C03",
                "name": "Silicone Creep Retardant Insulator Coating",
                "category": "Safety/Climate Gear",
                "requiredQty": 6 + int(math.ceil(extra_km * 4)),
                "unit": "cans",
                "isMandatory": False,
            },
            {
                "id": "EQ-ENV-C04",
                "name": "8-Wheeler Diesel-Electric Tower Wagon (DETC)",
                "category": "Heavy Machinery",
                "requiredQty": 1,
                "unit": "units",
                "isMandatory": True,
            },
        ]
    elif "DECCAN" in arm_upper or "SOUTH" in arm_upper:
        hazard_badge = "HEAVY GRADIENT & GHAT LATERAL SHEAR STRESS"
        severity = "AMBER"
        climate_equipment = [
            {
                "id": "EQ-ENV-D01",
                "name": "Electronic Laser Superelevation & Alignment Gauge",
                "category": "Tools",
                "requiredQty": 1,
                "unit": "units",
                "isMandatory": True,
            },
            {
                "id": "EQ-ENV-D02",
                "name": "25-Ton Heavy Hydraulic Climbing Track Jacks",
                "category": "Tools",
                "requiredQty": 4 + int(math.ceil(extra_km * 2)),
                "unit": "units",
                "isMandatory": True,
            },
            {
                "id": "EQ-ENV-D03",
                "name": "Incline Skid Blocks & Runaway Catch Anchors",
                "category": "Safety/Climate Gear",
                "requiredQty": 6,
                "unit": "sets",
                "isMandatory": True,
            },
            {
                "id": "EQ-ENV-D04",
                "name": "Hydraulic Tamping and Ballast Packing Tools",
                "category": "Tools",
                "requiredQty": 2 + int(math.ceil(extra_km * 1)),
                "unit": "kits",
                "isMandatory": True,
            },
        ]
    else:
        hazard_badge = "STANDARD OPERATIONAL CORRIDOR"
        severity = "YELLOW"
        climate_equipment = []

    # -------------------------------------------------------------------------
    # 2. Base Department & Defect Equipment Mapping
    # -------------------------------------------------------------------------
    base_equipment: List[Dict[str, Any]] = []
    dept_upper = department.upper()

    if dept_upper == "TMS":  # Track Management System (P-Way / Engineering)
        if any(w in defect_type.lower() for w in ["fracture", "buckl", "weld", "cut", "rail"]):
            base_equipment.extend([
                {
                    "id": "TMS-EQ-001",
                    "name": "70T Hydraulic Rail Tensor with Power Pack",
                    "category": "Tools",
                    "requiredQty": 1,
                    "unit": "units",
                    "isMandatory": True,
                },
                {
                    "id": "TMS-EQ-002",
                    "name": "Alumino-Thermic (AT) Rail Welding Kit",
                    "category": "Tools",
                    "requiredQty": 1 + int(math.ceil(extra_km * 1)),
                    "unit": "kits",
                    "isMandatory": True,
                },
                {
                    "id": "TMS-EQ-003",
                    "name": "Abrasive Disc Rail Cutting Machine",
                    "category": "Tools",
                    "requiredQty": 1,
                    "unit": "units",
                    "isMandatory": True,
                },
                {
                    "id": "TMS-EQ-004",
                    "name": "Self-Propelled Heavy Tamping Machine (CSM/08-32)",
                    "category": "Heavy Machinery",
                    "requiredQty": 1,
                    "unit": "units",
                    "isMandatory": False,
                },
            ])
        else:  # General Track Maintenance / Tamping / Screening
            base_equipment.extend([
                {
                    "id": "TMS-EQ-005",
                    "name": "Continuous Action Tamping Express (09-3X)",
                    "category": "Heavy Machinery",
                    "requiredQty": 1,
                    "unit": "units",
                    "isMandatory": True,
                },
                {
                    "id": "TMS-EQ-006",
                    "name": "Ballast Regulating Machine (BRM)",
                    "category": "Heavy Machinery",
                    "requiredQty": 1,
                    "unit": "units",
                    "isMandatory": False,
                },
                {
                    "id": "TMS-EQ-007",
                    "name": "Mechanical Track Gauges and Cross-Level Spirit Indicators",
                    "category": "Tools",
                    "requiredQty": 2 + int(math.ceil(extra_km * 1)),
                    "unit": "units",
                    "isMandatory": True,
                },
            ])

    elif dept_upper == "TDMS":  # Traction Distribution Management System (TRD / OHE)
        base_equipment.extend([
            {
                "id": "TDMS-EQ-001",
                "name": "8-Wheeler Diesel-Electric Tower Wagon (DETC)",
                "category": "Heavy Machinery",
                "requiredQty": 1,
                "unit": "units",
                "isMandatory": True,
            },
            {
                "id": "TDMS-EQ-002",
                "name": "25kV Discharge & Earth Grounding Poles",
                "category": "Tools",
                "requiredQty": 4,
                "unit": "units",
                "isMandatory": True,
            },
            {
                "id": "TDMS-EQ-003",
                "name": "Contact & Catenary Wire Tirfor Winch (3.2 Ton)",
                "category": "Tools",
                "requiredQty": 2,
                "unit": "units",
                "isMandatory": True,
            },
            {
                "id": "TDMS-EQ-004",
                "name": "Cantilever Dropper & Contact Wire Splices",
                "category": "Tools",
                "requiredQty": 12 + int(math.ceil(norm_length * 8)),
                "unit": "meters",
                "isMandatory": True,
            },
        ])

    elif dept_upper == "SMMS":  # Signal Maintenance Management System (S&T)
        base_equipment.extend([
            {
                "id": "SMMS-EQ-001",
                "name": "True-RMS Electronic Interlocking Digital Multimeter",
                "category": "Tools",
                "requiredQty": 2,
                "unit": "units",
                "isMandatory": True,
            },
            {
                "id": "SMMS-EQ-002",
                "name": "Point Machine Mechanical Crank Handle & Obstruction Gauge",
                "category": "Tools",
                "requiredQty": 1,
                "unit": "units",
                "isMandatory": True,
            },
            {
                "id": "SMMS-EQ-003",
                "name": "Audio Frequency Track Circuit (AFTC) Test Shunt",
                "category": "Tools",
                "requiredQty": 2,
                "unit": "units",
                "isMandatory": True,
            },
            {
                "id": "SMMS-EQ-004",
                "name": "Optical Time-Domain Reflectometer (OTDR Fiber Splicer)",
                "category": "Heavy Machinery",
                "requiredQty": 1,
                "unit": "units",
                "isMandatory": False,
            },
        ])

    total_equipment = base_equipment + climate_equipment

    # -------------------------------------------------------------------------
    # 3. Manpower Matrix with Linear Distance Scaling
    # -------------------------------------------------------------------------
    manpower: List[Dict[str, Any]] = []

    if dept_upper == "TMS":
        # Base 5 Gangmen + 2 per extra km
        gangmen_count = 5 + int(math.ceil(extra_km * 2))
        manpower = [
            {
                "roleId": "MP-TMS-01",
                "designation": "Senior Section Engineer (SSE / P-Way)",
                "quantity": 1,
                "certification": "IRICEN Track Renewal Competency (Grade-I)",
                "shiftHours": 4,
            },
            {
                "roleId": "MP-TMS-02",
                "designation": "Junior Engineer (JE / P-Way)",
                "quantity": 1 if norm_length < 2.0 else 2,
                "certification": "Thermal De-Stressing & LWR Supervisory Cert",
                "shiftHours": 4,
            },
            {
                "roleId": "MP-TMS-03",
                "designation": "Certified AT Welder (Technician)",
                "quantity": 1 if norm_length < 1.5 else 2,
                "certification": "RDSO Approved Alumino-Thermic Welder Lic.",
                "shiftHours": 4,
            },
            {
                "roleId": "MP-TMS-04",
                "designation": "Track Maintainer Gr IV (Gangmen)",
                "quantity": gangmen_count,
                "certification": "Track Safety & Lookout Banner Flag Protocol",
                "shiftHours": 4,
            },
        ]

    elif dept_upper == "TDMS":
        linemen_count = 4 + int(math.ceil(extra_km * 2))
        manpower = [
            {
                "roleId": "MP-TDMS-01",
                "designation": "Senior Section Engineer (SSE / TRD)",
                "quantity": 1,
                "certification": "25kV Power Block Authorization (PTW Level 3)",
                "shiftHours": 4,
            },
            {
                "roleId": "MP-TDMS-02",
                "designation": "Tower Wagon Pilot / Motorman",
                "quantity": 1,  # Heavy machinery crew is static
                "certification": "Self-Propelled DETC Route Pilot License",
                "shiftHours": 4,
            },
            {
                "roleId": "MP-TDMS-03",
                "designation": "OHE Lineman / Technician",
                "quantity": linemen_count,
                "certification": "Working at Heights & Live Cantilever Safety",
                "shiftHours": 4,
            },
            {
                "roleId": "MP-TDMS-04",
                "designation": "TRD Khalasi / Assistant",
                "quantity": 2 + int(math.ceil(extra_km * 1)),
                "certification": "High Voltage Safety Protocol Cert",
                "shiftHours": 4,
            },
        ]

    elif dept_upper == "SMMS":
        tech_count = 3 + int(math.ceil(extra_km * 1))
        manpower = [
            {
                "roleId": "MP-SMMS-01",
                "designation": "Senior Section Engineer (SSE / Signal)",
                "quantity": 1,
                "certification": "Electronic Interlocking (EI) Systems Cert",
                "shiftHours": 4,
            },
            {
                "roleId": "MP-SMMS-02",
                "designation": "Electrical Signal Maintainer (ESM Technician)",
                "quantity": tech_count,
                "certification": "Point Machine Calibration & Relay Lock Cert",
                "shiftHours": 4,
            },
            {
                "roleId": "MP-SMMS-03",
                "designation": "Telecom Maintainer (TCM)",
                "quantity": 1,
                "certification": "Axle Counter / MSDAC Diagnostic License",
                "shiftHours": 4,
            },
        ]

    return {
        "department": department,
        "corridorArm": corridor_arm,
        "defectType": defect_type,
        "lengthKm": round(norm_length, 2),
        "hazardBadge": hazard_badge,
        "severity": severity,
        "equipmentList": total_equipment,
        "manpower": manpower,
    }
