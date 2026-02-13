import "dotenv/config";
import { createServiceApp, resolvePort } from "../../../services/shared/boot";
import { getDashboardOverview } from "../../../lib/microservices/dashboard-service";

const app = createServiceApp("dashboard");

app.get("/dashboard/overview/:userId", async (request, response) => {
  const overview = await getDashboardOverview(String(request.params.userId ?? ""));
  if (!overview) {
    response.status(404).json({ message: "User not found" });
    return;
  }

  response.json(overview);
});

const port = resolvePort(process.env.DASHBOARD_SERVICE_PORT, 4102);
app.listen(port, () => {
  console.log(`finaware-dashboard listening on ${port}`);
});
