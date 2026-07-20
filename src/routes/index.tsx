import { createFileRoute } from "@tanstack/react-router";
import { Planner } from "@/components/planner/Planner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Load Planner — Daily Delivery Planning" },
      {
        name: "description",
        content:
          "Fast, keyboard-first offline planner for daily truck loads. Import invoices, assign areas, auto-allocate and print load sheets.",
      },
      { property: "og:title", content: "Load Planner" },
      { property: "og:description", content: "Warehouse-focused daily delivery planner." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Planner,
});
