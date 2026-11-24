export interface LinkMaintenanceFields {
  maintenanceEnabled?: boolean;
  maintenanceMessage?: string;
  maintenanceVideoUrl?: string;
}

export function isLinkInMaintenance(link: LinkMaintenanceFields | null | undefined): boolean {
  return !!link?.maintenanceEnabled;
}
