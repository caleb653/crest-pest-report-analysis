export interface SurveyQuestion {
  id: string;
  label: string;
  type: "single" | "multi" | "rating" | "text";
  options?: string[];
}

export const DEFAULT_PEST_SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: "pest_free_experience",
    label: "How pest-free has your space felt recently? (5 = completely pest-free)",
    type: "rating",
  },
  {
    id: "pest_sightings_frequency",
    label: "How often do you see pests in or around your space? (5 = almost never)",
    type: "rating",
  },
  {
    id: "outdoor_pest_issues",
    label: "Do you notice pest issues around the property — landscaping, trash areas, common areas? (5 = no issues at all)",
    type: "rating",
  },
  {
    id: "worry_level",
    label: "How often do you worry about pests in your space? (5 = never worry)",
    type: "rating",
  },
  {
    id: "comfort_level",
    label: "How comfortable do you feel in your space because of pest conditions? (5 = very comfortable)",
    type: "rating",
  },
  {
    id: "neighbor_reports",
    label: "Have you heard neighbors mention pest issues? (5 = never hear of any)",
    type: "rating",
  },
  {
    id: "pest_details",
    label: "If you've seen pests, what kind and where? (optional)",
    type: "text",
  },
  {
    id: "comments",
    label: "Any other comments about pest activity or the property? (optional)",
    type: "text",
  },
];

export const DEFAULT_SURVEY_INTRO =
  "Crest Pest Control is checking in to learn about pest activity at your property. Please rate each question on a scale of 1 to 5 — a higher score always means fewer pest issues. Your honest feedback helps property management and our team keep your space pest-free.";