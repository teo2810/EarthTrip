import { createFileRoute } from "@tanstack/react-router";
import { EarthTrip } from "@/components/earth-trip";

export const Route = createFileRoute("/")({ component: EarthTrip });
