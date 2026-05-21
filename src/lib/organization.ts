import type { ImageSourcePropType } from 'react-native';

import type { AccountType, Squadron } from '@/lib/store';
import {
  CHILD_SQUADRONS,
  DEFAULT_SQUADRON,
  GROUP_SQUADRON,
  getAccessibleSquadrons,
  getSquadronDisplayName,
  getScopedSquadronLabel,
  normalizeSquadron,
} from '@/lib/store';

type OrganizationMeta = {
  id: Squadron;
  shortLabel: string;
  displayName: string;
  statusBarLabel: string;
  kind: 'group' | 'squadron';
  logo: ImageSourcePropType;
};

const ORG_LOGOS: Record<Squadron, ImageSourcePropType> = {
  Knights: require('../../assets/images/org/knights.png'),
  Hawks: require('../../assets/images/org/hawks.png'),
  Tigers: require('../../assets/images/org/tigers.png'),
  Krakens: require('../../assets/images/org/krakens.png'),
  Warriors: require('../../assets/images/org/warriors.png'),
};

export const ORGANIZATIONS: Record<Squadron, OrganizationMeta> = {
  Knights: {
    id: 'Knights',
    shortLabel: 'Knights',
    displayName: 'Knights Group',
    statusBarLabel: 'Knights',
    kind: 'group',
    logo: ORG_LOGOS.Knights,
  },
  Hawks: {
    id: 'Hawks',
    shortLabel: 'Hawks',
    displayName: 'Hawks Squadron',
    statusBarLabel: 'Hawks',
    kind: 'squadron',
    logo: ORG_LOGOS.Hawks,
  },
  Tigers: {
    id: 'Tigers',
    shortLabel: 'Tigers',
    displayName: 'Tigers Squadron',
    statusBarLabel: 'Tigers',
    kind: 'squadron',
    logo: ORG_LOGOS.Tigers,
  },
  Krakens: {
    id: 'Krakens',
    shortLabel: 'Krakens',
    displayName: 'Krakens Squadron',
    statusBarLabel: 'Krakens',
    kind: 'squadron',
    logo: ORG_LOGOS.Krakens,
  },
  Warriors: {
    id: 'Warriors',
    shortLabel: 'Warriors',
    displayName: 'Warriors Squadron',
    statusBarLabel: 'Warriors',
    kind: 'squadron',
    logo: ORG_LOGOS.Warriors,
  },
};

export function getOrganizationMeta(squadron?: Squadron | string | null) {
  const normalized = normalizeSquadron(squadron, DEFAULT_SQUADRON);
  return ORGANIZATIONS[normalized];
}

export function getOrganizationChartNodes() {
  return {
    root: ORGANIZATIONS[GROUP_SQUADRON],
    children: CHILD_SQUADRONS.map((squadron) => ORGANIZATIONS[squadron]),
  };
}

export function getStatusBarOrganizationLabel(squadron?: Squadron | string | null) {
  const normalized = normalizeSquadron(squadron, DEFAULT_SQUADRON);
  return ORGANIZATIONS[normalized]?.statusBarLabel ?? getSquadronDisplayName(normalized);
}

export function getOrganizationContextLabel(squadron?: Squadron | string | null) {
  const normalized = normalizeSquadron(squadron, DEFAULT_SQUADRON);
  return getOrganizationMeta(normalized).shortLabel;
}

export function canAccessOrganizationActivity(
  viewerSquadron?: Squadron | string | null,
  targetSquadron?: Squadron | string | null,
  viewerAccountType?: AccountType | string | null
) {
  const normalizedViewer = normalizeSquadron(viewerSquadron, DEFAULT_SQUADRON);
  const normalizedTarget = normalizeSquadron(targetSquadron, DEFAULT_SQUADRON);
  if (viewerAccountType === 'fitflight_creator') {
    return true;
  }
  return getAccessibleSquadrons(normalizedViewer).includes(normalizedTarget);
}
