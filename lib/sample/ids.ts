import type { BlockId, CourseId, EventId, ImportId, LectureId, MaterialId, SectionId, SetId } from "@/lib/domain";

/** Stable ids, independent of the date, so mocks and walkthrough steps can name sample rows. */
export const SAMPLE = {
  importId: "imp_sample" as ImportId,
  courses: { csc148: "CSC148" as CourseId, mat137: "MAT137" as CourseId, eco101: "ECO101" as CourseId, psy100: "PSY100" as CourseId },
  events: {
    /** Mon 10–11am, BA 1160, "Recursion & tree traversal". */
    csc148Lecture8: "evt_sample_csc148_l08" as EventId,
    /** Tue 9–10am, "Integration by parts", transcript ready. */
    mat137LectureTue: "evt_sample_mat137_tue" as EventId,
    /** Thu 9–10am, ready to record. */
    mat137LectureThu: "evt_sample_mat137_thu" as EventId,
    eco101Lecture7: "evt_sample_eco101_l07" as EventId,
    /** Fri 6 Nov ("in 10 days"). */
    csc148Midterm: "evt_sample_csc148_midterm" as EventId,
    /** Fri 13 Nov. */
    mat137TermTest2: "evt_sample_mat137_tt2" as EventId,
    eco101Ps4: "evt_sample_eco101_ps4" as EventId,
    csc148A2: "evt_sample_csc148_a2" as EventId,
  },
  lectures: {
    csc148Lecture8: "lec.evt_sample_csc148_l08" as LectureId,
    mat137Tue: "lec.evt_sample_mat137_tue" as LectureId,
    mat137Thu: "lec.evt_sample_mat137_thu" as LectureId,
    eco101Lecture7: "lec.evt_sample_eco101_l07" as LectureId,
  },
  blocks: {
    /** Tue 10:30–11:15, the Paper "Next up". */
    recursionReview: "review.evt_sample_csc148_l08.2" as BlockId,
    midweekCsc: "midweek.CSC148.2026-W44" as BlockId,
  },
  materials: {
    csc148L8Slides: "mat_sample_csc148_l08_slides" as MaterialId,
    csc148Lab6: "mat_sample_csc148_lab6" as MaterialId,
    csc148A2Handout: "mat_sample_csc148_a2" as MaterialId,
    csc148Notes: "mat_sample_csc148_notes" as MaterialId,
    eco101Textbook: "mat_sample_eco101_text" as MaterialId,
    eco101L7Slides: "mat_sample_eco101_l07_slides" as MaterialId,
    eco101Ps4: "mat_sample_eco101_ps4" as MaterialId,
  },
  sets: { csc148Midterm2024: "set_sample_csc148_2024mt" as SetId, csc148TermTest2023: "set_sample_csc148_2023tt" as SetId },
  sections: { priceElasticity: "ECO101.price-elasticity-of-demand" as SectionId },
} as const;
