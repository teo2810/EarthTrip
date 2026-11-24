import { createRoot } from "react-dom/client";
import { EarthTrip } from "@/components/earth-trip";

const root = document.getElementById("app");
if (root) createRoot(root).render(<EarthTrip />);
