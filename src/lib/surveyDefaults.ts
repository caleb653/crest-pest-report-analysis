export interface SurveyQuestion {
  id: string;
  label: string;
  type: "single" | "multi" | "rating" | "text";
  options?: string[];
}

export const DEFAULT_PEST_SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: "activity_level",
    label: "How would you rate pest activity in your unit over the last 30 days?",
    type: "single",
    options: ["None", "Low", "Moderate", "High"],
  },
  {
    id: "pest_types",
    label: "Which pests have you seen? (select all that apply)",
    type: "multi",
    options: [
      "Ants", "Spiders", "Cockroaches", "Rodents (mice/rats)", "Bed bugs",
      "Fleas", "Wasps/Bees", "Silverfish", "Earwigs", "Mosquitoes", "Other / not sure",
    ],
  },
  {
    id: "location_seen",
    label: "Where have you noticed activity? (select all that apply)",
    type: "multi",
    options: ["Kitchen", "Bathroom", "Bedroom", "Living room", "Garage / patio", "Common area / hallway"],
  },
  {
    id: "satisfaction",
    label: "How satisfied are you with Crest's pest control service? (1 = poor, 5 = excellent)",
    type: "rating",
  },
  {
    id: "comments",
    label: "Any additional comments or concerns?",
    type: "text",
  },
];

export const DEFAULT_SURVEY_INTRO =
  "Crest Pest Control is checking in. Please take 30 seconds to share what you've been seeing in your unit. Your feedback helps us serve you better.";