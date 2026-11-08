import { readWorkspace } from "@/lib/server-workspace";

export async function GET(request: Request) {
  try {
    const workspace = await readWorkspace();
    const params = new URL(request.url).searchParams;
    const modelId = params.get("model");
    const storeId = params.get("store");
    if (modelId || storeId) {
      const model = workspace.models.find((m) => m.id === modelId);
      const store = model?.stores.find((s) => s.id === storeId);
      if (!model || !store) {
        return Response.json(
          { error: "Choose an available model and store." },
          { status: 404 },
        );
      }
      const baseline = workspace.models
        .find((m) => m.id === "gru_baseline")
        ?.stores.find((s) => s.id === storeId);
      return Response.json(
        {
          modelId,
          storeId,
          points: store.points,
          baseline: modelId === "gru" ? baseline?.points : undefined,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    // Send store metrics first; fetch individual daily series only on selection.
    // This keeps the overview small even when thousands of stores are present.
    return Response.json(
      {
        ...workspace,
        models: workspace.models.map((model) => ({
          ...model,
          stores: model.stores.map((store) => ({ ...store, points: [] })),
        })),
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    return Response.json(
      {
        error: missing
          ? "No forecast snapshot yet. Run the dashboard export from the project folder."
          : "The forecast snapshot could not be read. Regenerate it from the pipeline.",
      },
      { status: missing ? 503 : 500 },
    );
  }
}
