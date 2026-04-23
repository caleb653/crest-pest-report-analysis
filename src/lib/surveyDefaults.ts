export interface SurveyQuestion {
  id: string;
  label: string;
  type: "single" | "multi" | "rating" | "text";
  options?: string[];
}

export const DEFAULT_PEST_SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: "overall_satisfaction",
    label: "Overall, how satisfied are you with the pest control service?",
    type: "rating",
  },
  {
    id: "effectiveness",
    label: "How effective has the service been at controlling pests?",
    type: "rating",
  },
  {
    id: "professionalism",
    label: "How professional and courteous was the technician?",
    type: "rating",
  },
  {
    id: "communication",
    label: "How well did we communicate (scheduling, updates, follow-up)?",
    type: "rating",
  },
  {
    id: "cleanliness",
    label: "How clean and respectful was the work performed in your space?",
    type: "rating",
  },
  {
    id: "recommend",
    label: "How likely are you to recommend us to others?",
    type: "rating",
  },
  {
    id: "comments",
    label: "Any additional comments or concerns? (optional)",
    type: "text",
  },
];

export const DEFAULT_SURVEY_INTRO =
  "Crest Pest Control is checking in. Please take a moment to rate your experience on a scale of 1 (poor) to 5 (excellent). Your feedback helps us serve you better.";