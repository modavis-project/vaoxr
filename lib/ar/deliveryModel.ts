import report from "@/public/media/reports/organ-ar.json";

export const AR_DELIVERY_MODEL_PATH = "/media/models/organ-ar.glb";
const AR_DELIVERY_IOS_PATH = "/media/models/organ-ar.usdz";
const modelVersion = report.derivative.sha256.slice(0, 16);
const iosVersion = report.iosDerivative.sha256.slice(0, 16);

export const AR_DELIVERY_MODEL_URL = `${AR_DELIVERY_MODEL_PATH}?v=${modelVersion}`;
export const AR_DELIVERY_IOS_URL = `${AR_DELIVERY_IOS_PATH}?v=${iosVersion}`;
export const AR_DELIVERY_REPORT_URL = `/media/reports/organ-ar.json?v=${modelVersion}`;
