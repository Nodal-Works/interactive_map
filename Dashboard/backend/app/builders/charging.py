"""Turn charging specifications into ECOMToolkit objects."""
from __future__ import annotations

from typing import Optional

from app import toolkit  # noqa: F401  - puts ECOMToolkit on sys.path
from app.schemas.charging import (ChargePointSpec, ElectricVehicleSpec,
                                  session_target_soc)

from ECOMToolkit.entities import ChargePoint, ElectricVehicle


class ChargingBuildError(ValueError):
    """Raised with the offending charge point or vehicle named."""


def build_electric_vehicle(
    spec: ElectricVehicleSpec,
    analysis_period: Optional[tuple[int, int]] = None,
) -> ElectricVehicle:
    schedule = list(spec.availability) if spec.availability is not None else None

    try:
        ev = ElectricVehicle(
            name=spec.name,
            schedule=schedule,
            capacity=spec.capacity,
            is_hybrid=spec.is_hybrid,
            efficiency=spec.efficiency,
            daily_distance=spec.daily_distance,
            max_charging_power=spec.max_charging_power,
            v2g_enabled=spec.v2g_enabled,
            embodied_co2=spec.embodied_co2_per_kwh,
            analysis_period=analysis_period,
        )
    except Exception as err:
        raise ChargingBuildError(f"vehicle {spec.name!r}: {err}") from err

    # ElectricVehicle.validate returns a list of errors, or a string on success.
    result = ev.validate()
    if isinstance(result, list):
        raise ChargingBuildError(f"vehicle {spec.name!r}: {'; '.join(result)}")

    return ev


def _stays(day: list) -> list[int]:
    """The length in hours of each plugged-in stretch of a 24-hour day."""
    out, run = [], 0
    for value in day:
        if value:
            run += 1
        elif run:
            out.append(run)
            run = 0
    if run:
        # A stretch running into midnight carries on into the next morning.
        if out and day[0]:
            out[0] += run
        else:
            out.append(run)
    return out


# Never quite nothing: the toolkit draws a charger with no daily energy as a
# flat zero, which build_charge_point rightly treats as a broken charger.
MIN_DAILY_KWH = 0.1


def daily_charge_kwh(spec: ChargePointSpec) -> Optional[float]:
    """What the car takes in a day when its arrival charge is set, else None.

    The same sum the optimizer makes of each stay (session_target_soc): from
    the charge it arrives with up to what the stay can put in. Only for a
    24-hour pattern, which is what the panel sends; a full-year schedule keeps
    the driving distance.
    """
    ev = spec.ev
    if ev is None or ev.arrival_soc is None:
        return None
    if ev.availability is None or len(ev.availability) != 24:
        return None
    power = min(spec.capacity, ev.max_charging_power)
    total = 0.0
    for hours in _stays(list(ev.availability)):
        target = session_target_soc(ev.arrival_soc, ev.capacity, power, hours)
        total += (target - ev.arrival_soc) * ev.capacity
    return max(MIN_DAILY_KWH, total)


def build_charge_point(
    spec: ChargePointSpec,
    analysis_period: Optional[tuple[int, int]] = None,
) -> ChargePoint:
    ev_list = []
    if spec.ev is not None:
        ev_spec = spec.ev
        # The toolkit sizes a day's charging from the driving it has to cover:
        # distance times consumption. With an arrival charge set, the distance
        # is the one whose energy is what the optimizer would put in, so the
        # table and the optimizer charge the car the same.
        energy = daily_charge_kwh(spec)
        if energy is not None:
            ev_spec = ev_spec.model_copy(
                update={"daily_distance": energy * 100.0 / ev_spec.efficiency})
        ev_list = [build_electric_vehicle(ev_spec, analysis_period=analysis_period)]

    try:
        charge_point = ChargePoint(
            name=spec.name,
            point=None,                  # no Rhino geometry in the backend
            capacity=spec.capacity,
            charger_type=spec.charger_type,
            is_v2g=spec.is_v2g,
            owner=spec.owner,
            ev_list=ev_list,
        )
    except Exception as err:
        raise ChargingBuildError(f"charge point {spec.name!r}: {err}") from err

    # validate() returns a message rather than raising, so a broken charge point
    # would otherwise flow silently into the dispatch.
    message = charge_point.validate()
    if message.startswith("Error:"):
        raise ChargingBuildError(f"charge point {spec.name!r}: {message[len('Error: '):]}")

    if spec.location is not None:
        charge_point.x = spec.location.x
        charge_point.y = spec.location.y

    # A charge point with a vehicle attached but a flat zero demand profile means
    # the toolkit's single-EV branch did not fire, or the schedule never allows
    # charging. Either way the dispatch would show no EV load at all.
    if spec.ev is not None:
        total = float(charge_point.hourlydemand.df["value"].sum())
        if total <= 0:
            raise ChargingBuildError(
                f"charge point {spec.name!r}: vehicle {spec.ev.name!r} is attached "
                f"but the annual demand profile is zero. Check that availability "
                f"has plugged-in hours and daily_distance is greater than zero."
            )

    return charge_point
