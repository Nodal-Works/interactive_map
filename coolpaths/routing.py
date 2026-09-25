"""Length-bounded minimum-PET routing on a directed pedestrian graph.

Heat exposure has the same units used by CoolPaths: edge mean PET (°C)
multiplied by walking distance (m). The alternative minimizes that sum while
staying within 150% of the geometric shortest path.
"""

from __future__ import annotations

from dataclasses import dataclass
import heapq
import math


class RouteError(ValueError):
    pass


def distance_m(a: list[float], b: list[float]) -> float:
    lat = math.radians((a[1] + b[1]) / 2)
    dx = math.radians(b[0] - a[0]) * 6_371_000 * math.cos(lat)
    dy = math.radians(b[1] - a[1]) * 6_371_000
    return math.hypot(dx, dy)


@dataclass
class Label:
    node: str
    length: float
    heat: float
    previous: "Label | None" = None
    edge: dict | None = None
    active: bool = True


class Router:
    def __init__(self, graph: dict, edge_pet: dict[str, float]):
        self.nodes: dict[str, list[float]] = graph["nodes"]
        self.edges = graph["edges"]
        self.edge_pet = edge_pet
        self.outgoing: dict[str, list[dict]] = {node: [] for node in self.nodes}
        self.incoming: dict[str, list[dict]] = {node: [] for node in self.nodes}
        self.walkable_nodes: set[str] = set()
        for edge in self.edges:
            if edge["id"] in edge_pet and edge["length_m"] > 0:
                self.outgoing[edge["u"]].append(edge)
                self.incoming[edge["v"]].append(edge)
                self.walkable_nodes.update((edge["u"], edge["v"]))

    def snap(self, point: list[float], max_distance_m: float = 80) -> tuple[str, float]:
        if len(point) != 2 or not all(math.isfinite(float(v)) for v in point):
            raise RouteError("Coordinates must be finite [longitude, latitude] pairs")
        if not self.walkable_nodes:
            raise RouteError("Walking graph is empty")
        nearest = min(self.walkable_nodes, key=lambda node: distance_m(point, self.nodes[node]))
        separation = distance_m(point, self.nodes[nearest])
        if separation > max_distance_m:
            raise RouteError("Click closer to a walking path within the processed area")
        return nearest, separation

    def shortest(self, origin: str, destination: str) -> list[dict]:
        costs = {origin: 0.0}
        previous: dict[str, tuple[str, dict]] = {}
        queue = [(0.0, origin)]
        while queue:
            cost, node = heapq.heappop(queue)
            if cost > costs[node] + 1e-9:
                continue
            if node == destination:
                break
            for edge in self.outgoing.get(node, []):
                next_cost = cost + edge["length_m"]
                if next_cost < costs.get(edge["v"], math.inf):
                    costs[edge["v"]] = next_cost
                    previous[edge["v"]] = (node, edge)
                    heapq.heappush(queue, (next_cost, edge["v"]))
        if destination not in costs:
            raise RouteError("No walking route connects these points")
        path = []
        cursor = destination
        while cursor != origin:
            cursor, edge = previous[cursor]
            path.append(edge)
        return list(reversed(path))

    def remaining_distances(self, destination: str) -> dict[str, float]:
        """Shortest remaining walk from each node, used for safe budget pruning."""
        distances = {destination: 0.0}
        queue = [(0.0, destination)]
        while queue:
            length, node = heapq.heappop(queue)
            if length > distances[node] + 1e-9:
                continue
            for edge in self.incoming.get(node, []):
                next_length = length + edge["length_m"]
                if next_length < distances.get(edge["u"], math.inf):
                    distances[edge["u"]] = next_length
                    heapq.heappush(queue, (next_length, edge["u"]))
        return distances

    def coolest(self, origin: str, destination: str, budget_m: float) -> list[dict]:
        remaining = self.remaining_distances(destination)
        first = Label(origin, 0.0, 0.0)
        labels: dict[str, list[Label]] = {origin: [first]}
        queue: list[tuple[float, int, Label]] = [(0.0, 0, first)]
        serial = 1
        while queue:
            _, _, current = heapq.heappop(queue)
            if not current.active:
                continue
            if current.node == destination:
                path = []
                while current.edge is not None:
                    path.append(current.edge)
                    current = current.previous
                return list(reversed(path))
            for edge in self.outgoing.get(current.node, []):
                length = current.length + edge["length_m"]
                if length + remaining.get(edge["v"], math.inf) > budget_m + 1e-7:
                    continue
                heat = current.heat + self.edge_pet[edge["id"]] * edge["length_m"]
                prior = labels.setdefault(edge["v"], [])
                if any(x.length <= length + 1e-9 and x.heat <= heat + 1e-9 for x in prior):
                    continue
                for old in prior:
                    if length <= old.length + 1e-9 and heat <= old.heat + 1e-9:
                        old.active = False
                prior[:] = [x for x in prior if x.active]
                next_label = Label(edge["v"], length, heat, current, edge)
                prior.append(next_label)
                heapq.heappush(queue, (heat, serial, next_label))
                serial += 1
        raise RouteError("No route fits the distance budget")

    def describe(self, path: list[dict], label: str) -> dict:
        length = sum(edge["length_m"] for edge in path)
        heat = sum(self.edge_pet[edge["id"]] * edge["length_m"] for edge in path)
        coordinates: list[list[float]] = []
        profile = [{"distance_m": 0, "pet_c": round(self.edge_pet[path[0]["id"]], 2)}]
        traveled = 0.0
        for edge in path:
            line = edge["coordinates"]
            coordinates.extend(line if not coordinates else line[1:])
            traveled += edge["length_m"]
            profile.append({"distance_m": round(traveled, 1),
                            "pet_c": round(self.edge_pet[edge["id"]], 2)})
        return {
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coordinates},
            "properties": {"kind": label, "distance_m": round(length, 1),
                           "heat_exposure_c_m": round(heat, 1),
                           "mean_pet_c": round(heat / length, 2),
                           "profile": profile},
        }

    def route(self, origin: list[float], destination: list[float],
              detour_limit: float = 0.5) -> dict:
        start, start_distance = self.snap(origin)
        end, end_distance = self.snap(destination)
        if start == end:
            raise RouteError("Choose points farther apart on the walking network")
        baseline = self.shortest(start, end)
        baseline_length = sum(edge["length_m"] for edge in baseline)
        try:
            alternative = self.coolest(start, end, baseline_length * (1 + detour_limit))
        except RouteError:
            alternative = baseline
        baseline_heat = sum(self.edge_pet[edge["id"]] * edge["length_m"] for edge in baseline)
        alternative_heat = sum(self.edge_pet[edge["id"]] * edge["length_m"] for edge in alternative)
        if alternative_heat > baseline_heat:
            alternative = baseline
        shortest = self.describe(baseline, "shortest")
        coolest = self.describe(alternative, "coolest")
        sp = shortest["properties"]
        cp = coolest["properties"]
        return {
            "snapped_origin": self.nodes[start], "snapped_destination": self.nodes[end],
            "snap_distance_m": [round(start_distance, 1), round(end_distance, 1)],
            "shortest": shortest, "coolest": coolest,
            "comparison": {
                "extra_distance_m": round(cp["distance_m"] - sp["distance_m"], 1),
                "extra_distance_pct": round(100 * (cp["distance_m"] / sp["distance_m"] - 1), 1),
                "heat_reduction_pct": round(100 * (1 - cp["heat_exposure_c_m"] / sp["heat_exposure_c_m"]), 1)
                if sp["heat_exposure_c_m"] else 0,
                "detour_limit_pct": round(detour_limit * 100),
            },
        }
