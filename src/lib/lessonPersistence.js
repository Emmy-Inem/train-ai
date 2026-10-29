// Update existing lessons in place so edits retain progress, notes and IDs.
// RLS remains authoritative for every read and write.
export async function saveCourseLessons(client, courseId, lessons) {
  const { data: existing, error } = await client.from("lessons").select("id").eq("course_id", courseId);
  if (error) throw error;
  const existingIds = new Set((existing || []).map(row => row.id));
  const retainedIds = new Set();
  for (const [index, lesson] of lessons.entries()) {
    const row = {
      title: lesson.title,
      duration_minutes: lesson.duration_minutes ?? lesson.duration ?? null,
      video_url: lesson.video_url ?? lesson.videoUrl ?? null,
      order_index: index,
    };
    if (lesson.id && existingIds.has(lesson.id)) {
      const { data, error } = await client.from("lessons").update(row).eq("course_id", courseId).eq("id", lesson.id).select("id");
      if (error) throw error;
      if (data?.length !== 1) throw new Error("This lesson could not be saved. Refresh the course and retry.");
      retainedIds.add(lesson.id);
    } else {
      if (lesson.id && !lesson.id.startsWith("temp-")) throw new Error("The course lessons have changed. Refresh the course before saving.");
      const { data, error } = await client.from("lessons").insert({ ...row, course_id: courseId }).select("id");
      if (error) throw error;
      if (data?.length !== 1) throw new Error("The new lesson could not be saved. Refresh the course and retry.");
      // Keep the generated ID for retries after a later write fails.
      lesson.id = data[0].id;
      retainedIds.add(lesson.id);
    }
  }
  const removedIds = [...existingIds].filter(id => !retainedIds.has(id));
  if (removedIds.length) {
    const { error } = await client.from("lessons").delete().eq("course_id", courseId).in("id", removedIds);
    if (error) throw error;
  }
}
