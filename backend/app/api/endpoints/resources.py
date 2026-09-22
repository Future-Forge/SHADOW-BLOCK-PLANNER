"""
FastAPI REST router for Indian Railways Intelligent Resource & Manpower Allocation.
"""
from fastapi import APIRouter, Query, HTTPException
from typing import Optional
from app.core.resource_engine import calculate_resources

router = APIRouter(prefix="/api/v1/resources", tags=["Resource Allocation Engine"])


@router.get("/calculate")
def get_resource_allocation(
    block_id: str = Query("BLK-CURRENT", description="Block Identifier"),
    department: str = Query("TMS", description="TMS | SMMS | TDMS"),
    defect_type: str = Query("Rail Fracture", description="Maintenance task or defect"),
    corridor_arm: str = Query("WESTERN", description="WESTERN | GANGETIC | EAST_COASTAL | DECCAN"),
    length_km: float = Query(1.0, ge=0.1, le=50.0, description="Block section length in km"),
):
    """
    Computes dynamic equipment checklist and manpower allocation matrix with
    linear distance scaling and corridor-specific environmental hazard injection.
    """
    dept_norm = department.upper()
    if dept_norm not in ["TMS", "SMMS", "TDMS"]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid department '{department}'. Must be one of TMS, SMMS, TDMS."
        )

    result = calculate_resources(
        department=dept_norm,
        defect_type=defect_type,
        corridor_arm=corridor_arm,
        length_km=length_km,
    )
    result["blockId"] = block_id
    return result
