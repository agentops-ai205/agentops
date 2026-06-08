import { nanoid } from "nanoid";

export function id(prefix: string) {
  return `${prefix}_${nanoid(12)}`;
}

export function missionId() {
  return `AOS-MIS-${new Date().getFullYear()}-${nanoid(6).toUpperCase()}`;
}

export function improvementId() {
  return `IMP-${new Date().getFullYear()}-${nanoid(6).toUpperCase()}`;
}
