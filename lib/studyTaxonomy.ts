export type StudyTaxonomyEntry = {
  top_level: string;
  subheading: string;
  label: string;
  definition: string;
};

export const STUDY_TAXONOMY: StudyTaxonomyEntry[] = [
  {
    top_level: "Non-research_and_opinion",
    subheading: "Opinion_and_commentary",
    label: "Editorial_Commentary_Viewpoint",
    definition: "Opinion or reflection on a topic, policy, or paper, without new data collection or formal research methods.",
  },
  {
    top_level: "Non-research_and_opinion",
    subheading: "Opinion_and_commentary",
    label: "Perspective_Essay",
    definition: "Conceptual or thought piece discussing ideas, theory, or future directions, without systematic data collection or analysis.",
  },
  {
    top_level: "Non-research_and_opinion",
    subheading: "Guidance_and_standards",
    label: "Guideline_Consensus_Statement",
    definition: "Recommendations or standards developed by a group or organization, often combining evidence summaries with expert consensus.",
  },
  {
    top_level: "Non-research_and_opinion",
    subheading: "Guidance_and_standards",
    label: "Protocol_Methods_Paper",
    definition: "Report of planned or ongoing study methods, including design and procedures, without reporting final outcomes.",
  },
  {
    top_level: "Evidence_synthesis",
    subheading: "Systematic_reviews",
    label: "Systematic_Review_No_Meta",
    definition: "Review using predefined, explicit methods to comprehensively search, select, and appraise studies, with primarily narrative synthesis and no pooled effect estimate.",
  },
  {
    top_level: "Evidence_synthesis",
    subheading: "Systematic_reviews",
    label: "Systematic_Review_With_Meta",
    definition: "Systematic review that also statistically combines results from multiple studies into one or more pooled quantitative effect estimates.",
  },
  {
    top_level: "Evidence_synthesis",
    subheading: "Rapid_and_scoping_reviews",
    label: "Rapid_Review",
    definition: "Evidence synthesis using streamlined or restricted systematic methods to provide findings within a short timeframe.",
  },
  {
    top_level: "Evidence_synthesis",
    subheading: "Rapid_and_scoping_reviews",
    label: "Scoping_Review",
    definition: "Systematic mapping of the breadth and nature of evidence on a topic, emphasizing coverage, concepts, and study types rather than detailed effect estimates.",
  },
  {
    top_level: "Evidence_synthesis",
    subheading: "Reviews_of_reviews",
    label: "Umbrella_Review_Overview_of_Reviews",
    definition: "Evidence synthesis that compiles and compares findings from existing systematic reviews rather than primary studies.",
  },
  {
    top_level: "Experimental_and_quasi_experimental",
    subheading: "Randomized_trials",
    label: "Individual_Randomized_Controlled_Trial",
    definition: "Interventional study where individual participants are randomly allocated to intervention and comparator groups and outcomes are compared between them.",
  },
  {
    top_level: "Experimental_and_quasi_experimental",
    subheading: "Randomized_trials",
    label: "Cluster_Randomized_Trial",
    definition: "Interventional study where groups or clusters (such as clinics or communities), rather than individuals, are randomized to intervention or control.",
  },
  {
    top_level: "Experimental_and_quasi_experimental",
    subheading: "Randomized_trials",
    label: "Crossover_Randomized_Trial",
    definition: "Randomized trial in which participants receive two or more interventions in a randomized order, typically separated by a washout period.",
  },
  {
    top_level: "Experimental_and_quasi_experimental",
    subheading: "Randomized_trials",
    label: "Stepped_Wedge_Cluster_Trial",
    definition: "Cluster trial design where all clusters start in control and are sequentially switched to the intervention at randomized time points.",
  },
  {
    top_level: "Experimental_and_quasi_experimental",
    subheading: "Quasi_experimental_designs",
    label: "Before_After_Pre_Post_Study",
    definition: "Non-randomized interventional study comparing outcomes in the same population before and after an intervention or policy change.",
  },
  {
    top_level: "Experimental_and_quasi_experimental",
    subheading: "Quasi_experimental_designs",
    label: "Interrupted_Time_Series",
    definition: "Study using repeated outcome measurements over time before and after an intervention to estimate changes in level and trend attributable to the intervention.",
  },
  {
    top_level: "Experimental_and_quasi_experimental",
    subheading: "Quasi_experimental_designs",
    label: "Difference_in_Differences",
    definition: "Non-randomized comparative design that contrasts changes in outcomes over time between an exposed group and a concurrent unexposed group.",
  },
  {
    top_level: "Analytic_observational",
    subheading: "Cohort_studies",
    label: "Prospective_Cohort_Study",
    definition: "Observational study assembling participants free of the outcome and following them forward in time to compare outcome incidence across exposure groups.",
  },
  {
    top_level: "Analytic_observational",
    subheading: "Cohort_studies",
    label: "Retrospective_Cohort_Study",
    definition: "Observational study using existing records to reconstruct past exposure and follow-up, comparing outcome incidence across exposure groups.",
  },
  {
    top_level: "Analytic_observational",
    subheading: "Case_control_and_cross_sectional",
    label: "Case_Control_Study",
    definition: "Observational study comparing individuals with the outcome (cases) to those without (controls) to assess prior exposures or risk factors.",
  },
  {
    top_level: "Analytic_observational",
    subheading: "Case_control_and_cross_sectional",
    label: "Analytic_Cross_Sectional_Study",
    definition: "Observational study measuring exposure(s) and outcome(s) at a single time point and analyzing associations between them.",
  },
  {
    top_level: "Descriptive_observational",
    subheading: "Case_level_descriptions",
    label: "Case_Report",
    definition: "Detailed description of a single patient, event, or occurrence, typically highlighting unusual or novel clinical features.",
  },
  {
    top_level: "Descriptive_observational",
    subheading: "Case_level_descriptions",
    label: "Case_Series",
    definition: "Description of a group of similar cases without a formal comparison group or hypothesis-driven analytic component.",
  },
  {
    top_level: "Descriptive_observational",
    subheading: "Population_descriptions",
    label: "Descriptive_Cross_Sectional_Study_Survey",
    definition: "Study that provides a snapshot of characteristics, behaviors, or outcomes in a population at one point in time without formal exposure–outcome modeling.",
  },
  {
    top_level: "Descriptive_observational",
    subheading: "Population_descriptions",
    label: "Registry_or_Surveillance_Descriptive_Study",
    definition: "Descriptive analysis of events, outcomes, or practices drawn from ongoing registries or surveillance systems without analytic comparisons.",
  },
  {
    top_level: "Qualitative_and_mixed_methods",
    subheading: "Qualitative_research",
    label: "Qualitative_Study",
    definition: "Study using qualitative methods such as interviews, focus groups, or observations to explore experiences, perceptions, or processes with systematic qualitative analysis.",
  },
  {
    top_level: "Qualitative_and_mixed_methods",
    subheading: "Qualitative_research",
    label: "Ethnographic_Study",
    definition: "In-depth qualitative study using prolonged observation and participation in a setting or culture to understand practices and meanings.",
  },
  {
    top_level: "Qualitative_and_mixed_methods",
    subheading: "Mixed_methods",
    label: "Mixed_Methods_Study",
    definition: "Study that intentionally integrates quantitative and qualitative components within one coherent design to address linked research questions.",
  },
  {
    top_level: "Methodological_measurement_and_modelling",
    subheading: "Diagnostic_and_prognostic",
    label: "Diagnostic_Accuracy_Study",
    definition: "Study evaluating how well an index test identifies a condition by comparing it with a reference standard, typically reporting sensitivity and specificity or related metrics.",
  },
  {
    top_level: "Methodological_measurement_and_modelling",
    subheading: "Diagnostic_and_prognostic",
    label: "Prognostic_or_Risk_Prediction_Study",
    definition: "Study that develops, updates, or validates a model or set of predictors to estimate risk of future outcomes.",
  },
  {
    top_level: "Methodological_measurement_and_modelling",
    subheading: "Measurement",
    label: "Instrument_or_Scale_Development_Validation",
    definition: "Study that develops or evaluates the measurement properties of a questionnaire, scale, or instrument, including reliability and validity.",
  },
  {
    top_level: "Methodological_measurement_and_modelling",
    subheading: "Economic_and_modelling",
    label: "Economic_Evaluation",
    definition: "Study comparing costs and consequences of interventions using frameworks such as cost-effectiveness, cost-utility, or cost-benefit analysis.",
  },
  {
    top_level: "Methodological_measurement_and_modelling",
    subheading: "Economic_and_modelling",
    label: "Simulation_or_Decision_Analytic_Modelling_Study",
    definition: "Study using mathematical or computer models, such as Markov or transmission models, to project outcomes under different scenarios or policies.",
  },
  {
    top_level: "Other_primary_data",
    subheading: "Laboratory_and_preclinical",
    label: "Laboratory_Bench_Preclinical_Study",
    definition: "Experimental study using cells, tissues, animals, or other non-human systems to investigate mechanisms or effects.",
  },
  {
    top_level: "Other_primary_data",
    subheading: "Omics_and_bioinformatics",
    label: "Genetic_Omics_Bioinformatics_Study",
    definition: "Study using genomic, transcriptomic, proteomic, or related high-throughput data and computational analysis to explore associations or mechanisms.",
  },
  {
    top_level: "Other_primary_data",
    subheading: "Secondary_analyses",
    label: "Secondary_Data_Analysis",
    definition: "Study conducting new analyses to address a different question using existing data collected for another primary purpose.",
  },
];

function formatTaxonomyForPrompt(): string {
  const lines = STUDY_TAXONOMY.map(
    (e) => `- ${e.subheading} > ${e.label}: ${e.definition}`
  );
  return lines.join("\n");
}

export function getStudyTaxonomyPrompt(): string {
  const taxonomyBlock = formatTaxonomyForPrompt();
  return `You must classify the abstract into exactly one subheading and exactly one label from the taxonomy below.

Taxonomy:
${taxonomyBlock}

Rules:
- Base your classification primarily on the abstract. The title and publication types are supplementary.
- Only assign a type when you are 95% or more certain it is correct. If you are less than 95% certain, return "Unclear" for both fields.
- Common reasons to return Unclear: abstract is missing or too short, the study type is ambiguous between two categories, or the abstract describes something not in the taxonomy.
- Use only subheading and label values that appear exactly in the taxonomy above.
- Output strict JSON only, with no other text. Use exactly these keys:
  - study_subheading (string)
  - study_label (string)
  - confidence (integer 0–100, your estimated certainty about this classification)`;
}
