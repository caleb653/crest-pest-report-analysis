export interface SurveyQuestion {
  id: string;
  label: string;
  type: "single" | "multi" | "rating" | "text";
  options?: string[];
  /** Optional conditional display: only show this question when another answer matches. */
  dependsOn?: {
    questionId: string;
    /** For "single" parents: equals this value. For "multi" parents: at least one of these values selected. */
    equals?: string;
    includesAny?: string[];
    /** For "multi" parents: hide when ALL listed values are present (e.g. "None of the above"). */
    excludesAny?: string[];
  };
  /** When true and the question is `multi`, render an inline "Other" free-text field next to the option labelled "Other". */
  otherFreeText?: boolean;
}

const PEST_OPTIONS = [
  "Ants",
  "Cockroaches",
  "Spiders",
  "Rodents (mice/rats)",
  "Bed Bugs",
  "Fleas",
  "Wasps/Bees",
  "Other",
];

export const DEFAULT_PEST_SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: "unit_number",
    label: "1. What is your unit number?",
    type: "text",
  },
  {
    id: "pests_inside_unit",
    label: "2. Have you noticed any pests inside your unit within the last month?",
    type: "single",
    options: ["Yes", "No"],
  },
  {
    id: "pests_inside_types",
    label: "3. What type of pest(s) have you seen? (check all that apply)",
    type: "multi",
    options: PEST_OPTIONS,
    otherFreeText: true,
    dependsOn: { questionId: "pests_inside_unit", equals: "Yes" },
  },
  {
    id: "pests_inside_locations",
    label: "4. Where have you noticed pest activity? (check all that apply)",
    type: "multi",
    options: ["Kitchen", "Bathroom", "Bedroom(s)", "Living Room", "Patio/Balcony"],
    dependsOn: { questionId: "pests_inside_unit", equals: "Yes" },
  },
  {
    id: "pests_inside_when",
    label: "5. When did you first notice the issue?",
    type: "single",
    options: ["Within the past week", "Within the past month", "More than a month ago"],
    dependsOn: { questionId: "pests_inside_unit", equals: "Yes" },
  },
  {
    id: "pests_around_property",
    label: "6. Have you noticed any pests around the property within the last couple of months?",
    type: "single",
    options: ["Yes", "No"],
  },
  {
    id: "pests_around_types",
    label: "7. What type of pest(s) have you seen? (check all that apply)",
    type: "multi",
    options: PEST_OPTIONS,
    otherFreeText: true,
    dependsOn: { questionId: "pests_around_property", equals: "Yes" },
  },
  {
    id: "pests_around_locations",
    label: "8. Where have you noticed pest activity? (check all that apply)",
    type: "multi",
    options: [
      "Exterior of my building",
      "Near trash areas",
      "Parking garage",
      "Laundry room",
      "Other",
    ],
    otherFreeText: true,
    dependsOn: { questionId: "pests_around_property", equals: "Yes" },
  },
  {
    id: "pests_around_frequency",
    label: "9. How often are you seeing pests?",
    type: "single",
    options: ["Daily", "A few times per week", "Occasionally", "Only once"],
    dependsOn: { questionId: "pests_around_property", equals: "Yes" },
  },
  {
    id: "conditions_observed",
    label: "10. Have you noticed any of the following? (check all that apply)",
    type: "multi",
    options: [
      "Food debris attracting pests",
      "Moisture issues (leaks, damp areas)",
      "Gaps/cracks/holes in walls or floors",
      "Trash buildup nearby",
      "None of the above",
    ],
  },
  {
    id: "conditions_details",
    label: "11. Can you elaborate on where you notice these items?",
    type: "text",
    dependsOn: {
      questionId: "conditions_observed",
      includesAny: [
        "Food debris attracting pests",
        "Moisture issues (leaks, damp areas)",
        "Gaps/cracks/holes in walls or floors",
        "Trash buildup nearby",
      ],
    },
  },
  {
    id: "other_observations",
    label: "12. Any other pest-related observations you'd like to share?",
    type: "text",
  },
];

export const DEFAULT_SURVEY_INTRO =
  "Your responses help us improve pest control service across the property and proactively take care of pest issues before they become a problem. This survey takes less than 2 minutes.";

export const DEFAULT_ONBOARDING_SURVEY_TITLE = "Property Onboarding Survey";

export const DEFAULT_ONBOARDING_SURVEY_INTRO =
  "Help us tailor pest control to your property. This short onboarding survey covers scheduling, points of contact, and a few benchmark questions so we can serve you better from day one.";

export const DEFAULT_ONBOARDING_SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: "onb_preferred_days",
    label: "1. What are your preferred days? (check all that apply)",
    type: "multi",
    options: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  },
  {
    id: "onb_preferred_times",
    label: "2. What are your preferred times for service? (note: we typically provide a 2-hour arrival window)",
    type: "text",
  },
  {
    id: "onb_office_contact",
    label: "3. Who is the best point of contact for our office team?",
    type: "text",
  },
  {
    id: "onb_field_contact",
    label: "4. Who is the best point of contact for our field team?",
    type: "text",
  },
  {
    id: "onb_payment_method",
    label: "5. What is your preferred payment method?",
    type: "single",
    options: ["ACH", "Credit Card", "Check", "Other"],
  },
  {
    id: "onb_upset_tenants_frequency",
    label: "6. How often do you have upset tenants because pest issues are going unresolved?",
    type: "single",
    options: [
      "Every day (all I do is deal with pest control issues)",
      "Couple times per week",
      "Couple times per month",
      "Couple times per quarter",
      "Couple times per year",
      "Never",
    ],
  },
  {
    id: "onb_free_and_clear_time",
    label: "7. On average, how long does it take for a vacant unit to get the “free and clear” stamp?",
    type: "single",
    options: [
      "Less than 1 week",
      "1-2 weeks",
      "2-3 weeks",
      "3-4 weeks",
      "4+ weeks",
    ],
  },
  {
    id: "onb_rental_delay",
    label: "8. On average, how long does pest control delay the rental of a vacant unit?",
    type: "single",
    options: [
      "It doesn't",
      "Less than 1 week",
      "1-2 weeks",
      "2-3 weeks",
      "3-4 weeks",
      "4+ weeks (am I ever going to get this unit rented?)",
    ],
  },
  {
    id: "onb_hours_per_month",
    label: "9. Approximately how many hours per month do you spend on pest-control related activities (e.g., fielding requests from tenants, sending prep sheets, setting up follow-ups, etc.)?",
    type: "single",
    options: [
      "Less than 1 hour",
      "1-2 hours",
      "2-4 hours",
      "4-6 hours",
      "6-8 hours",
      "8-10 hours",
      "10+ hours",
    ],
  },
  {
    id: "onb_emergency_response",
    label: "10. If emergency pest issues arise, how quickly does your current pest control show up?",
    type: "single",
    options: [
      "Within 2 hours",
      "Within 24 hours",
      "Within 48 hours",
      "Within 72 hours",
      "Whenever they want (why am I even paying these guys?)",
    ],
  },
];