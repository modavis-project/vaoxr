import { performanceTimelineSchema, type PerformanceTimeline } from "@/lib/content/schemas";
import { fetchVerifiedVaoUrl } from "@/lib/vao/integrity";

export async function fetchPerformanceTimeline(url: string): Promise<PerformanceTimeline> {
  const bytes = await fetchVerifiedVaoUrl(url);
  return performanceTimelineSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
}
