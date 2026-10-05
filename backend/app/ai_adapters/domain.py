"""Pure calculations adapted from AI_ENGINE/weather_engine.py and safety_matrix.py.

The imported thresholds are scenario assumptions, not verified railway standards.
No live weather, physical interlocking, or executed dispatch is implied.
"""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class ThermalFeatures(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra="forbid")
    ambient_temp_c: float = Field(ge=-50, le=70)
    cloud_cover_pct: float = Field(default=15, ge=0, le=100)
    solar_radiation_factor: float = Field(default=1, ge=0, le=2)
    section_length_km: float = Field(default=45, gt=0, le=2000)


def thermal_risk(features: ThermalFeatures):
    delta = 15 * max(0.2, 1 - features.cloud_cover_pct / 150) * features.solar_radiation_factor
    temperature = features.ambient_temp_c + delta
    stress = max(0, 2.1e5 * 1.15e-5 * (temperature - 35))
    # Keep the supplied safety matrix's TSR thresholds (55C, not the weather module's 52C).
    tier, speed = ("CRITICAL", 30) if temperature >= 60 else ("HIGH", 50) if temperature >= 55 else ("MODERATE", 80) if temperature >= 45 else ("NOMINAL", 130)
    return {"rail_temp_c": round(temperature, 1), "solar_heating_delta_c": round(delta, 1),
            "compressive_thermal_stress_mpa": round(stress, 2), "risk_level": tier,
            "scenario_speed_kmh": speed, "estimated_transit_increase_minutes": round(features.section_length_km * (1 / speed - 1 / 130) * 60, 1),
            "features": features.model_dump(), "source": "SUPPLIED_THERMAL_SCENARIO",
            "notice": "Calculated scenario with assumed neutral temperature 35°C and nominal speed 130 km/h. Not measured weather; no speed restriction imposed."}


class SafetyFeatures(BaseModel):
    departments: list[Literal["TMS", "SMMS", "TDMS"]] = Field(min_length=1, max_length=3)


def safety_checklist(departments: list[str]):
    rules = {
        "TMS": ["Engineering track protection and worksite clearance require controller verification.", "Adjacent-track clearance must be assessed for the actual site."],
        "SMMS": ["Signal disconnection and point-clamping arrangements require authorised verification."],
        "TDMS": ["OHE power isolation, earthing and permit-to-work require authorised verification."],
    }
    checklist = [item for dept in dict.fromkeys(departments) for item in rules[dept]]
    if "TMS" in departments and "TDMS" in departments:
        checklist.append("Verify bonding continuity and compatible work sequencing before shared track/traction work.")
    return {"departments": departments, "checklist": checklist, "status": "REQUIRES_CONTROLLER_VERIFICATION",
            "source": "SUPPLIED_SAFETY_RULES", "notice": "Planning checklist only; no permit, electrical isolation or interlocking state has been verified."}
