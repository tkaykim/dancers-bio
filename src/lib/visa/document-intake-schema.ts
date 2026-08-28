import { z } from "zod";

export const VISA_DOCUMENT_SCHEMA_VERSION = 1 as const;

const shortText = z.string().trim().max(160);
const mediumText = z.string().trim().max(500);
const dateText = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Please check the date format.");
const itemId = z.string().trim().min(1).max(80);

const passportSchema = z.object({
  id: itemId,
  type: z.enum(["ordinary", "diplomatic", "official", "other", ""]),
  number: z.string().trim().max(32),
  issuingCountry: shortText,
  expiryDate: dateText,
});

const previousNameSchema = z.object({
  id: itemId,
  fullNameEnglish: shortText,
});

const familyMemberSchema = z.object({
  id: itemId,
  nameEnglish: shortText,
  birthDate: dateText,
  nationality: shortText,
  relationship: shortText,
});

const accompanyingFamilySchema = z.object({
  id: itemId,
  relationship: shortText,
});

const travelSchema = z.object({
  id: itemId,
  country: shortText,
  purpose: shortText,
  startDate: dateText,
  endDate: dateText,
});

export const visaDocumentDraftSchema = z.object({
  schemaVersion: z.literal(VISA_DOCUMENT_SCHEMA_VERSION),
  preferredLang: z.enum(["ko", "en", "ja"]),
  fullNameEnglish: shortText,
  hanjaName: shortText,
  birthDate: dateText,
  mobilePhone: shortText,
  homePhone: shortText,
  hasNoHomePhone: z.boolean(),
  homeCountryAddress: mediumText,
  currentResidenceDifferent: z.boolean(),
  currentResidenceAddress: mediumText,
  koreaPlannedAddress: mediumText,
  nationalIdNumber: z.string().trim().max(80),
  nationalIdNotApplicable: z.boolean(),
  dualNationality: z.boolean(),
  dualNationalityCountries: z.array(shortText).max(5),
  primaryPassport: passportSchema,
  hasOtherPassports: z.boolean(),
  otherPassports: z.array(passportSchema).max(5),
  usedOtherNameInKorea: z.boolean(),
  previousNames: z.array(previousNameSchema).max(5),
  emergencyContact: z.object({
    nameEnglish: shortText,
    phone: shortText,
    country: shortText,
    relationship: shortText,
  }),
  education: z.object({
    level: z.enum(["high_school", "bachelor", "master", "doctorate", ""]),
    schoolName: shortText,
    city: shortText,
    region: shortText,
    country: shortText,
  }),
  maritalStatus: z.enum(["married", "divorced", "single", ""]),
  spouse: z.object({
    nameEnglish: shortText,
    birthDate: dateText,
    nationality: shortText,
    residence: mediumText,
    phone: shortText,
  }),
  hasChildren: z.boolean(),
  childrenCount: z.number().int().min(0).max(20),
  hasFamilyInKorea: z.boolean(),
  familyInKorea: z.array(familyMemberSchema).max(15),
  hasAccompanyingFamily: z.boolean(),
  accompanyingFamily: z.array(accompanyingFamilySchema).max(15),
  koreaVisitCountLast5Years: z.number().int().min(0).max(100),
  latestKoreaVisit: z.object({
    purpose: shortText,
    startDate: dateText,
    endDate: dateText,
  }),
  otherInternationalTravel: z.array(travelSchema).max(30),
  sensitiveCollectionConsent: z.boolean(),
  truthfulnessConfirmed: z.boolean(),
});

export type VisaDocumentFormData = z.infer<typeof visaDocumentDraftSchema>;

export type VisaDocumentSensitiveData = {
  nationalIdNumber: string;
  primaryPassportNumber: string;
  otherPassportNumbers: Record<string, string>;
};

export type VisaDocumentStoredFormData = Omit<
  VisaDocumentFormData,
  "nationalIdNumber" | "primaryPassport" | "otherPassports"
> & {
  primaryPassport: Omit<VisaDocumentFormData["primaryPassport"], "number">;
  otherPassports: Array<Omit<VisaDocumentFormData["otherPassports"][number], "number">>;
};

export const EMPTY_VISA_DOCUMENT_FORM: VisaDocumentFormData = {
  schemaVersion: VISA_DOCUMENT_SCHEMA_VERSION,
  preferredLang: "en",
  fullNameEnglish: "",
  hanjaName: "",
  birthDate: "",
  mobilePhone: "",
  homePhone: "",
  hasNoHomePhone: false,
  homeCountryAddress: "",
  currentResidenceDifferent: false,
  currentResidenceAddress: "",
  koreaPlannedAddress: "",
  nationalIdNumber: "",
  nationalIdNotApplicable: false,
  dualNationality: false,
  dualNationalityCountries: [],
  primaryPassport: {
    id: "primary",
    type: "ordinary",
    number: "",
    issuingCountry: "",
    expiryDate: "",
  },
  hasOtherPassports: false,
  otherPassports: [],
  usedOtherNameInKorea: false,
  previousNames: [],
  emergencyContact: {
    nameEnglish: "",
    phone: "",
    country: "",
    relationship: "",
  },
  education: {
    level: "",
    schoolName: "",
    city: "",
    region: "",
    country: "",
  },
  maritalStatus: "",
  spouse: {
    nameEnglish: "",
    birthDate: "",
    nationality: "",
    residence: "",
    phone: "",
  },
  hasChildren: false,
  childrenCount: 0,
  hasFamilyInKorea: false,
  familyInKorea: [],
  hasAccompanyingFamily: false,
  accompanyingFamily: [],
  koreaVisitCountLast5Years: 0,
  latestKoreaVisit: {
    purpose: "",
    startDate: "",
    endDate: "",
  },
  otherInternationalTravel: [],
  sensitiveCollectionConsent: false,
  truthfulnessConfirmed: false,
};

export function splitVisaDocumentData(form: VisaDocumentFormData): {
  stored: VisaDocumentStoredFormData;
  sensitive: VisaDocumentSensitiveData;
} {
  const {
    nationalIdNumber,
    primaryPassport,
    otherPassports,
    ...rest
  } = form;
  const { number: primaryPassportNumber, ...storedPrimaryPassport } = primaryPassport;
  const otherPassportNumbers: Record<string, string> = {};
  const storedOtherPassports = otherPassports.map(({ number, ...passport }) => {
    otherPassportNumbers[passport.id] = number;
    return passport;
  });

  return {
    stored: {
      ...rest,
      primaryPassport: storedPrimaryPassport,
      otherPassports: storedOtherPassports,
    },
    sensitive: {
      nationalIdNumber,
      primaryPassportNumber,
      otherPassportNumbers,
    },
  };
}

export function joinVisaDocumentData(
  stored: unknown,
  sensitive: VisaDocumentSensitiveData | null,
  prefill: Partial<VisaDocumentFormData> = {},
): VisaDocumentFormData {
  const candidate = {
    ...EMPTY_VISA_DOCUMENT_FORM,
    ...prefill,
    ...(stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {}),
  } as VisaDocumentFormData;

  candidate.primaryPassport = {
    ...EMPTY_VISA_DOCUMENT_FORM.primaryPassport,
    ...(candidate.primaryPassport ?? {}),
    number: sensitive?.primaryPassportNumber ?? "",
  };
  candidate.otherPassports = (candidate.otherPassports ?? []).map((passport) => ({
    ...passport,
    number: sensitive?.otherPassportNumbers?.[passport.id] ?? "",
  }));
  candidate.nationalIdNumber = sensitive?.nationalIdNumber ?? "";
  return visaDocumentDraftSchema.parse(candidate);
}

function addRequiredIssue(
  context: z.RefinementCtx,
  path: Array<string | number>,
  value: string,
  message: string,
) {
  if (!value.trim()) context.addIssue({ code: "custom", path, message });
}

function validateDateRange(
  context: z.RefinementCtx,
  path: Array<string | number>,
  startDate: string,
  endDate: string,
) {
  if (startDate && endDate && startDate > endDate) {
    context.addIssue({ code: "custom", path, message: "The departure date cannot be earlier than the arrival date." });
  }
}

export const visaDocumentSubmissionSchema = visaDocumentDraftSchema.superRefine((form, context) => {
  addRequiredIssue(context, ["fullNameEnglish"], form.fullNameEnglish, "Please enter your full name in English.");
  addRequiredIssue(context, ["birthDate"], form.birthDate, "Please enter your date of birth.");
  addRequiredIssue(context, ["mobilePhone"], form.mobilePhone, "Please enter your mobile phone number.");
  if (!form.hasNoHomePhone) {
    addRequiredIssue(context, ["homePhone"], form.homePhone, "Enter a home telephone number or select that you do not have one.");
  }
  addRequiredIssue(context, ["homeCountryAddress"], form.homeCountryAddress, "Please enter your home-country address.");
  if (form.currentResidenceDifferent) {
    addRequiredIssue(context, ["currentResidenceAddress"], form.currentResidenceAddress, "Please enter your current residential address.");
  }
  addRequiredIssue(context, ["koreaPlannedAddress"], form.koreaPlannedAddress, "Please enter your planned address in Korea.");
  if (!form.nationalIdNotApplicable) {
    addRequiredIssue(context, ["nationalIdNumber"], form.nationalIdNumber, "Enter your national identification number or select not applicable.");
  }
  if (form.dualNationality && form.dualNationalityCountries.length === 0) {
    context.addIssue({ code: "custom", path: ["dualNationalityCountries"], message: "Please enter your other nationality countries." });
  }
  addRequiredIssue(context, ["primaryPassport", "number"], form.primaryPassport.number, "Please enter your passport number.");
  addRequiredIssue(context, ["primaryPassport", "issuingCountry"], form.primaryPassport.issuingCountry, "Please enter the passport issuing country.");
  addRequiredIssue(context, ["primaryPassport", "expiryDate"], form.primaryPassport.expiryDate, "Please enter the passport expiry date.");
  if (form.hasOtherPassports && form.otherPassports.length === 0) {
    context.addIssue({ code: "custom", path: ["otherPassports"], message: "Please add the other valid passport." });
  }
  for (const [index, passport] of form.otherPassports.entries()) {
    addRequiredIssue(context, ["otherPassports", index, "number"], passport.number, "Please enter the passport number.");
    addRequiredIssue(context, ["otherPassports", index, "issuingCountry"], passport.issuingCountry, "Please enter the issuing country.");
    addRequiredIssue(context, ["otherPassports", index, "expiryDate"], passport.expiryDate, "Please enter the expiry date.");
  }
  if (form.usedOtherNameInKorea && form.previousNames.length === 0) {
    context.addIssue({ code: "custom", path: ["previousNames"], message: "Please enter the English name used previously." });
  }
  addRequiredIssue(context, ["emergencyContact", "nameEnglish"], form.emergencyContact.nameEnglish, "Please enter the emergency contact's name.");
  addRequiredIssue(context, ["emergencyContact", "phone"], form.emergencyContact.phone, "Please enter the emergency contact's phone number.");
  addRequiredIssue(context, ["emergencyContact", "country"], form.emergencyContact.country, "Please enter the emergency contact's country of residence.");
  addRequiredIssue(context, ["emergencyContact", "relationship"], form.emergencyContact.relationship, "Please enter your relationship to the emergency contact.");
  if (!form.education.level) context.addIssue({ code: "custom", path: ["education", "level"], message: "Please select your highest education." });
  addRequiredIssue(context, ["education", "schoolName"], form.education.schoolName, "Please enter the school name.");
  addRequiredIssue(context, ["education", "city"], form.education.city, "Please enter the school's city.");
  addRequiredIssue(context, ["education", "country"], form.education.country, "Please enter the school's country.");
  if (!form.maritalStatus) context.addIssue({ code: "custom", path: ["maritalStatus"], message: "Please select your marital status." });
  if (form.maritalStatus === "married") {
    addRequiredIssue(context, ["spouse", "nameEnglish"], form.spouse.nameEnglish, "Please enter your spouse's full name in English.");
    addRequiredIssue(context, ["spouse", "birthDate"], form.spouse.birthDate, "Please enter your spouse's date of birth.");
    addRequiredIssue(context, ["spouse", "nationality"], form.spouse.nationality, "Please enter your spouse's nationality.");
    addRequiredIssue(context, ["spouse", "residence"], form.spouse.residence, "Please enter your spouse's residence.");
    addRequiredIssue(context, ["spouse", "phone"], form.spouse.phone, "Please enter your spouse's phone number.");
  }
  if (form.hasChildren && form.childrenCount < 1) {
    context.addIssue({ code: "custom", path: ["childrenCount"], message: "Please enter the number of children." });
  }
  if (form.hasFamilyInKorea && form.familyInKorea.length === 0) {
    context.addIssue({ code: "custom", path: ["familyInKorea"], message: "Please add the family member living in Korea." });
  }
  if (form.hasAccompanyingFamily && form.accompanyingFamily.length === 0) {
    context.addIssue({ code: "custom", path: ["accompanyingFamily"], message: "Please add the accompanying family member." });
  }
  if (form.koreaVisitCountLast5Years > 0) {
    addRequiredIssue(context, ["latestKoreaVisit", "purpose"], form.latestKoreaVisit.purpose, "Please enter the purpose of your most recent Korea visit.");
    addRequiredIssue(context, ["latestKoreaVisit", "startDate"], form.latestKoreaVisit.startDate, "Please enter the arrival date of your most recent Korea visit.");
    addRequiredIssue(context, ["latestKoreaVisit", "endDate"], form.latestKoreaVisit.endDate, "Please enter the departure date of your most recent Korea visit.");
    validateDateRange(context, ["latestKoreaVisit", "endDate"], form.latestKoreaVisit.startDate, form.latestKoreaVisit.endDate);
  }
  for (const [index, travel] of form.otherInternationalTravel.entries()) {
    addRequiredIssue(context, ["otherInternationalTravel", index, "country"], travel.country, "Please enter the country visited.");
    addRequiredIssue(context, ["otherInternationalTravel", index, "purpose"], travel.purpose, "Please enter the purpose of the trip.");
    addRequiredIssue(context, ["otherInternationalTravel", index, "startDate"], travel.startDate, "Please enter the arrival date.");
    addRequiredIssue(context, ["otherInternationalTravel", index, "endDate"], travel.endDate, "Please enter the departure date.");
    validateDateRange(context, ["otherInternationalTravel", index, "endDate"], travel.startDate, travel.endDate);
  }
  if (!form.sensitiveCollectionConsent) {
    context.addIssue({ code: "custom", path: ["sensitiveCollectionConsent"], message: "Please consent to the collection and use of sensitive identification information." });
  }
  if (!form.truthfulnessConfirmed) {
    context.addIssue({ code: "custom", path: ["truthfulnessConfirmed"], message: "Please confirm that the information is complete and accurate." });
  }
});

export function firstVisaDocumentIssue(error: z.ZodError): { field: string; message: string } {
  const issue = error.issues[0];
  return {
    field: issue?.path.join(".") ?? "form",
    message: issue?.message ?? "Please check the information you entered.",
  };
}
