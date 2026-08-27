import { z } from "zod";

export const VISA_DOCUMENT_SCHEMA_VERSION = 1 as const;

const shortText = z.string().trim().max(160);
const mediumText = z.string().trim().max(500);
const dateText = z
  .string()
  .trim()
  .refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "날짜 형식을 확인해 주세요.");
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
    context.addIssue({ code: "custom", path, message: "종료일은 시작일보다 빠를 수 없습니다." });
  }
}

export const visaDocumentSubmissionSchema = visaDocumentDraftSchema.superRefine((form, context) => {
  addRequiredIssue(context, ["fullNameEnglish"], form.fullNameEnglish, "영문 성명을 입력해 주세요.");
  addRequiredIssue(context, ["birthDate"], form.birthDate, "생년월일을 입력해 주세요.");
  addRequiredIssue(context, ["mobilePhone"], form.mobilePhone, "휴대폰 번호를 입력해 주세요.");
  if (!form.hasNoHomePhone) {
    addRequiredIssue(context, ["homePhone"], form.homePhone, "자택 전화번호를 입력하거나 없음에 체크해 주세요.");
  }
  addRequiredIssue(context, ["homeCountryAddress"], form.homeCountryAddress, "본국 주소를 입력해 주세요.");
  if (form.currentResidenceDifferent) {
    addRequiredIssue(context, ["currentResidenceAddress"], form.currentResidenceAddress, "현재 거주지 주소를 입력해 주세요.");
  }
  addRequiredIssue(context, ["koreaPlannedAddress"], form.koreaPlannedAddress, "한국 체류 예정 주소를 입력해 주세요.");
  if (!form.nationalIdNotApplicable) {
    addRequiredIssue(context, ["nationalIdNumber"], form.nationalIdNumber, "국가식별번호를 입력하거나 해당 없음에 체크해 주세요.");
  }
  if (form.dualNationality && form.dualNationalityCountries.length === 0) {
    context.addIssue({ code: "custom", path: ["dualNationalityCountries"], message: "복수 국적 국가를 입력해 주세요." });
  }
  addRequiredIssue(context, ["primaryPassport", "number"], form.primaryPassport.number, "여권 번호를 입력해 주세요.");
  addRequiredIssue(context, ["primaryPassport", "issuingCountry"], form.primaryPassport.issuingCountry, "여권 발급 국가를 입력해 주세요.");
  addRequiredIssue(context, ["primaryPassport", "expiryDate"], form.primaryPassport.expiryDate, "여권 만료일을 입력해 주세요.");
  if (form.hasOtherPassports && form.otherPassports.length === 0) {
    context.addIssue({ code: "custom", path: ["otherPassports"], message: "다른 유효한 여권 정보를 입력해 주세요." });
  }
  for (const [index, passport] of form.otherPassports.entries()) {
    addRequiredIssue(context, ["otherPassports", index, "number"], passport.number, "여권 번호를 입력해 주세요.");
    addRequiredIssue(context, ["otherPassports", index, "issuingCountry"], passport.issuingCountry, "발급 국가를 입력해 주세요.");
    addRequiredIssue(context, ["otherPassports", index, "expiryDate"], passport.expiryDate, "만료일을 입력해 주세요.");
  }
  if (form.usedOtherNameInKorea && form.previousNames.length === 0) {
    context.addIssue({ code: "custom", path: ["previousNames"], message: "과거 사용한 영문 성명을 입력해 주세요." });
  }
  addRequiredIssue(context, ["emergencyContact", "nameEnglish"], form.emergencyContact.nameEnglish, "비상 연락처 이름을 입력해 주세요.");
  addRequiredIssue(context, ["emergencyContact", "phone"], form.emergencyContact.phone, "비상 연락처 전화번호를 입력해 주세요.");
  addRequiredIssue(context, ["emergencyContact", "country"], form.emergencyContact.country, "비상 연락처 거주 국가를 입력해 주세요.");
  addRequiredIssue(context, ["emergencyContact", "relationship"], form.emergencyContact.relationship, "관계를 입력해 주세요.");
  if (!form.education.level) context.addIssue({ code: "custom", path: ["education", "level"], message: "최종 학력을 선택해 주세요." });
  addRequiredIssue(context, ["education", "schoolName"], form.education.schoolName, "학교 이름을 입력해 주세요.");
  addRequiredIssue(context, ["education", "city"], form.education.city, "학교 소재 도시를 입력해 주세요.");
  addRequiredIssue(context, ["education", "country"], form.education.country, "학교 소재 국가를 입력해 주세요.");
  if (!form.maritalStatus) context.addIssue({ code: "custom", path: ["maritalStatus"], message: "혼인 사항을 선택해 주세요." });
  if (form.maritalStatus === "married") {
    addRequiredIssue(context, ["spouse", "nameEnglish"], form.spouse.nameEnglish, "배우자 영문 성명을 입력해 주세요.");
    addRequiredIssue(context, ["spouse", "birthDate"], form.spouse.birthDate, "배우자 생년월일을 입력해 주세요.");
    addRequiredIssue(context, ["spouse", "nationality"], form.spouse.nationality, "배우자 국적을 입력해 주세요.");
    addRequiredIssue(context, ["spouse", "residence"], form.spouse.residence, "배우자 거주지를 입력해 주세요.");
    addRequiredIssue(context, ["spouse", "phone"], form.spouse.phone, "배우자 연락처를 입력해 주세요.");
  }
  if (form.hasChildren && form.childrenCount < 1) {
    context.addIssue({ code: "custom", path: ["childrenCount"], message: "자녀 수를 입력해 주세요." });
  }
  if (form.hasFamilyInKorea && form.familyInKorea.length === 0) {
    context.addIssue({ code: "custom", path: ["familyInKorea"], message: "한국에 거주하는 가족 정보를 입력해 주세요." });
  }
  if (form.hasAccompanyingFamily && form.accompanyingFamily.length === 0) {
    context.addIssue({ code: "custom", path: ["accompanyingFamily"], message: "동반 가족 정보를 입력해 주세요." });
  }
  if (form.koreaVisitCountLast5Years > 0) {
    addRequiredIssue(context, ["latestKoreaVisit", "purpose"], form.latestKoreaVisit.purpose, "최근 한국 방문 목적을 입력해 주세요.");
    addRequiredIssue(context, ["latestKoreaVisit", "startDate"], form.latestKoreaVisit.startDate, "최근 한국 방문 시작일을 입력해 주세요.");
    addRequiredIssue(context, ["latestKoreaVisit", "endDate"], form.latestKoreaVisit.endDate, "최근 한국 방문 종료일을 입력해 주세요.");
    validateDateRange(context, ["latestKoreaVisit", "endDate"], form.latestKoreaVisit.startDate, form.latestKoreaVisit.endDate);
  }
  for (const [index, travel] of form.otherInternationalTravel.entries()) {
    addRequiredIssue(context, ["otherInternationalTravel", index, "country"], travel.country, "방문 국가를 입력해 주세요.");
    addRequiredIssue(context, ["otherInternationalTravel", index, "purpose"], travel.purpose, "방문 목적을 입력해 주세요.");
    addRequiredIssue(context, ["otherInternationalTravel", index, "startDate"], travel.startDate, "방문 시작일을 입력해 주세요.");
    addRequiredIssue(context, ["otherInternationalTravel", index, "endDate"], travel.endDate, "방문 종료일을 입력해 주세요.");
    validateDateRange(context, ["otherInternationalTravel", index, "endDate"], travel.startDate, travel.endDate);
  }
  if (!form.sensitiveCollectionConsent) {
    context.addIssue({ code: "custom", path: ["sensitiveCollectionConsent"], message: "고유식별정보 수집·이용에 동의해 주세요." });
  }
  if (!form.truthfulnessConfirmed) {
    context.addIssue({ code: "custom", path: ["truthfulnessConfirmed"], message: "입력 내용 확인에 체크해 주세요." });
  }
});

export function firstVisaDocumentIssue(error: z.ZodError): { field: string; message: string } {
  const issue = error.issues[0];
  return {
    field: issue?.path.join(".") ?? "form",
    message: issue?.message ?? "입력값을 확인해 주세요.",
  };
}
