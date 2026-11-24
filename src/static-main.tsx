import { createRoot } from "react-dom/client";
import { EarthTrip } from "@/components/earth-trip";
import "./styles.css";

const root = document.getElementById("app");
if (root) createRoot(root).render(<EarthTrip />);
