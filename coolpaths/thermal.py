"""Raster thermal calculations adapted from the CoolPaths notebook workflow.

The notebook's equal-PMV proxy remains here for reproducibility checks. The
prepared map uses MEMI PET and a body-aware MRT to avoid the proxy's large
bias under ordinary summer conditions. Shadow and sky-view calculations
operate on the local DSM without a Colab or Google Drive dependency.
"""

from __future__ import annotations

import math
import numpy as np
from scipy.ndimage import shift


SIGMA = 5.67e-8


def _obstacle_view(surface: np.ndarray, observer: np.ndarray, azimuth_deg: float,
                   distance_m: float, resolution_m: float) -> np.ndarray:
    azimuth = math.radians(azimuth_deg)
    row_shift = math.cos(azimuth) * distance_m / resolution_m
    col_shift = -math.sin(azimuth) * distance_m / resolution_m
    sampled = shift(surface, (row_shift, col_shift), order=0, mode="constant", cval=np.nan,
                    prefilter=False)
    return np.nan_to_num((sampled - observer) / distance_m, nan=-1.0)


def sky_view_factor(surface: np.ndarray, ground: np.ndarray, resolution_m: float,
                    directions: int = 12, max_distance_m: float = 96) -> np.ndarray:
    """Integrate the horizon angle over azimuth around a 1.1 m observer."""
    observer = ground + 1.1
    distances = [resolution_m * x for x in (2, 4, 8, 16, 32, 48)]
    distances = [d for d in distances if d <= max_distance_m]
    view = np.zeros_like(surface, dtype=np.float32)
    for azimuth in np.linspace(0, 360, directions, endpoint=False):
        slope = np.zeros_like(surface, dtype=np.float32)
        for distance in distances:
            slope = np.maximum(slope, _obstacle_view(surface, observer, azimuth,
                                                     distance, resolution_m))
        view += 1.0 / (1.0 + slope * slope)
    return np.clip(view / directions, 0.05, 1).astype(np.float32)


def shadow_mask(surface: np.ndarray, ground: np.ndarray, resolution_m: float,
                azimuth_deg: float, elevation_deg: float,
                max_distance_m: float = 120) -> np.ndarray:
    if elevation_deg <= 0:
        return np.ones_like(surface, dtype=bool)
    observer = ground + 1.1
    solar_slope = math.tan(math.radians(elevation_deg))
    shadow = np.zeros_like(surface, dtype=bool)
    step = max(2 * resolution_m, 4)
    for distance in np.arange(step, max_distance_m + step, step):
        shadow |= _obstacle_view(surface, observer, azimuth_deg, float(distance),
                                 resolution_m) > solar_slope
    return shadow


def radiant_temperature(air_c: float, direct_wm2: np.ndarray,
                        diffuse_wm2: float, svf: np.ndarray,
                        albedo: np.ndarray, canopy_mask: np.ndarray,
                        solar_elevation_deg: float,
                        tree_diffuse_transmission: float = 0.5) -> np.ndarray:
    """Body-aware outdoor MRT for a standing walker, in °C.

    ``direct_wm2`` is irradiance on a horizontal surface. A standing person's
    projected direct-beam area is about 0.28 of body area (SOLWEIG). Sky and
    ground each occupy roughly half of the diffuse/reflected view. Shortwave
    absorption is 0.70 and longwave emissivity is 0.97 (ISO 7726 values).
    Surface temperatures are approximated by air temperature, as in CoolPaths.
    """
    effective_svf = svf * (1 - (1 - tree_diffuse_transmission) * canopy_mask)
    sin_elevation = max(math.sin(math.radians(solar_elevation_deg)), 0.05)
    projected_direct = direct_wm2 / sin_elevation * 0.28
    sky_diffuse = 0.5 * effective_svf * diffuse_wm2
    ground_reflected = 0.5 * albedo * (direct_wm2 + diffuse_wm2)
    shortwave = (projected_direct + sky_diffuse + ground_reflected) * (0.70 / 0.97)
    air_kelvin = air_c + 273.15
    longwave = (effective_svf * 0.90 + (1 - effective_svf) * 0.95) * SIGMA * air_kelvin ** 4
    return ((np.maximum(shortwave + longwave, 1) / SIGMA) ** 0.25 - 273.15).astype(np.float32)


def pet_memi(air_c, radiant_c, wind_ms, relative_humidity,
             met=2.3, clo=0.9):
    """Physiological Equivalent Temperature from the MEMI steady-state model."""
    from pythermalcomfort.models import pet_steady

    result = pet_steady(tdb=air_c, tr=radiant_c, v=wind_ms,
                        rh=relative_humidity, met=met, clo=clo,
                        position="standing")
    return np.asarray(result.pet, dtype=np.float32)


def pmv_iso(air_c, radiant_c, wind_ms, relative_humidity, met=2.3, clo=0.9):
    """Legacy CoolPaths notebook fallback; not used for prepared PET outputs."""
    air, radiant, wind, rh = np.broadcast_arrays(
        np.asarray(air_c, dtype=np.float64), np.asarray(radiant_c, dtype=np.float64),
        np.asarray(wind_ms, dtype=np.float64), np.asarray(relative_humidity, dtype=np.float64))
    metabolic = met * 58.15
    insulation = 0.155 * clo
    clothing_area = 1 + 0.2 * clo if clo <= 0.5 else 1.05 + 0.645 * clo
    vapor_pressure = rh / 100 * 610.94 * np.exp(17.625 * air / (air + 243.04))
    forced_convection = 12.1 * np.sqrt(np.maximum(wind, 0))
    clothing_temp = air + (35.5 - air) / (3.5 * (insulation + 0.1))
    for _ in range(50):
        radiative_coefficient = (4 * SIGMA * clothing_area *
                                 ((clothing_temp + radiant + 546.3) / 2) ** 3)
        convection = np.maximum(forced_convection, 2.38 * np.abs(clothing_temp - air) ** 0.25)
        numerator = (35.7 - 0.028 * metabolic + insulation * clothing_area *
                     (radiative_coefficient * (radiant - clothing_temp) +
                      convection * (air - clothing_temp)))
        updated = numerator / (1 + insulation * clothing_area *
                               (radiative_coefficient + convection))
        if np.max(np.abs(updated - clothing_temp)) < 0.001:
            clothing_temp = updated
            break
        clothing_temp = updated
    convection = np.maximum(forced_convection, 2.38 * np.abs(clothing_temp - air) ** 0.25)
    losses = (
        3.05 * (5.733 - 0.007 * metabolic - vapor_pressure / 1000)
        + max(0, 0.42 * (metabolic - 58.15))
        + 1.7e-5 * metabolic * (5867 - vapor_pressure)
        + 0.0014 * metabolic * (34 - air)
        + 3.96e-8 * clothing_area * ((clothing_temp + 273.15) ** 4 -
                                     (radiant + 273.15) ** 4)
        + clothing_area * convection * (clothing_temp - air)
    )
    return ((0.303 * np.exp(-0.036 * metabolic) + 0.028) * (metabolic - losses)).astype(np.float32)


def pet_equal_pmv(air_c, radiant_c, wind_ms, relative_humidity,
                  met=2.3, clo=0.9, iterations=18):
    """Reproduce the notebook's equal-PMV proxy for comparisons only."""
    target = pmv_iso(air_c, radiant_c, wind_ms, relative_humidity, met, clo)
    lower = np.full_like(target, -20, dtype=np.float32)
    upper = np.full_like(target, 60, dtype=np.float32)
    target = np.clip(target, pmv_iso(lower, lower, 0.1, 50, met, clo),
                     pmv_iso(upper, upper, 0.1, 50, met, clo))
    for _ in range(iterations):
        middle = (lower + upper) / 2
        reference = pmv_iso(middle, middle, 0.1, 50, met, clo)
        below = reference < target
        lower = np.where(below, middle, lower)
        upper = np.where(below, upper, middle)
    return ((lower + upper) / 2).astype(np.float32)
