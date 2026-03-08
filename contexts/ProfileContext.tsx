import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Profile, UserProgress } from '../types';

const PROFILES_KEY = 'tippsy_profiles';
const ACTIVE_PROFILE_KEY = 'tippsy_active_profile_id';
const LEGACY_PROGRESS_KEY = 'tippsy_progress';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function emptyProgress(): UserProgress {
  return {
    unlockedStageId: 1,
    unlockedSubLevelId: 1,
    stats: {
      totalCharsTyped: 0,
      totalTimePlayed: 0,
      gamesPlayed: 0,
      highestWpm: 0,
      averageWpm: 0,
      averageAccuracy: 0,
    },
    lastSessionByKey: {},
    sessionHistory: [],
    perStageBest: {},
    errorCountByChar: {},
  };
}

function normalizeProgress(parsed: Record<string, unknown>): UserProgress {
  return {
    unlockedStageId: typeof parsed.unlockedStageId === 'number' ? parsed.unlockedStageId : 1,
    unlockedSubLevelId: typeof parsed.unlockedSubLevelId === 'number' ? parsed.unlockedSubLevelId : 1,
    stats: parsed.stats && typeof parsed.stats === 'object'
      ? (parsed.stats as UserProgress['stats'])
      : emptyProgress().stats,
    lastSessionByKey: (parsed.lastSessionByKey && typeof parsed.lastSessionByKey === 'object'
      ? parsed.lastSessionByKey
      : {}) as Record<string, UserProgress['lastSessionByKey'] extends Record<string, infer V> ? V : never>,
    sessionHistory: Array.isArray(parsed.sessionHistory) ? parsed.sessionHistory : [],
    perStageBest: (parsed.perStageBest && typeof parsed.perStageBest === 'object'
      ? parsed.perStageBest
      : {}) as UserProgress['perStageBest'],
    errorCountByChar: (parsed.errorCountByChar && typeof parsed.errorCountByChar === 'object'
      ? parsed.errorCountByChar
      : {}) as Record<string, number>,
  };
}

function initialProfiles(): Profile[] {
  // Try reading new multi-profile storage
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (raw) {
      const parsed: Profile[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }

  // Migration: wrap the existing single-player progress as "Player 1"
  try {
    const legacyRaw = localStorage.getItem(LEGACY_PROGRESS_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw) as Record<string, unknown>;
      const profile: Profile = {
        id: generateId(),
        name: 'Player 1',
        avatar: '🐱',
        progress: normalizeProgress(parsed),
      };
      return [profile];
    }
  } catch { /* ignore */ }

  // Fresh start
  return [{ id: generateId(), name: 'Player 1', avatar: '🐱', progress: emptyProgress() }];
}

function initialActiveId(profiles: Profile[]): string {
  try {
    const stored = localStorage.getItem(ACTIVE_PROFILE_KEY);
    if (stored && profiles.some(p => p.id === stored)) return stored;
  } catch { /* ignore */ }
  return profiles[0].id;
}

function persistProfiles(profiles: Profile[], activeId: string): void {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
    localStorage.setItem(ACTIVE_PROFILE_KEY, activeId);
    // Keep legacy key in sync so any external tools can still read it
    const active = profiles.find(p => p.id === activeId);
    if (active) {
      localStorage.setItem(LEGACY_PROGRESS_KEY, JSON.stringify(active.progress));
    }
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------

interface ProfileContextValue {
  profiles: Profile[];
  activeProfileId: string;
  activeProfile: Profile;
  setActiveProfileId: (id: string) => void;
  addProfile: (name: string, avatar: string) => void;
  removeProfile: (id: string) => void;
  updateProfileName: (id: string, name: string) => void;
  updateProfileAvatar: (id: string, avatar: string) => void;
  updateActiveProgress: (progress: UserProgress) => void;
}

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profiles, setProfiles] = useState<Profile[]>(() => {
    const loaded = initialProfiles();
    // Persist immediately so the next read finds the migrated data
    persistProfiles(loaded, initialActiveId(loaded));
    return loaded;
  });

  const [activeProfileId, setActiveProfileIdState] = useState<string>(() =>
    initialActiveId(initialProfiles())
  );

  const activeProfile = useMemo(
    () => profiles.find(p => p.id === activeProfileId) ?? profiles[0],
    [profiles, activeProfileId]
  );

  const setActiveProfileId = useCallback((id: string) => {
    setActiveProfileIdState(id);
    try {
      localStorage.setItem(ACTIVE_PROFILE_KEY, id);
      const active = profiles.find(p => p.id === id);
      if (active) localStorage.setItem(LEGACY_PROGRESS_KEY, JSON.stringify(active.progress));
    } catch { /* ignore */ }
  }, [profiles]);

  const addProfile = useCallback((name: string, avatar: string) => {
    const newProfile: Profile = { id: generateId(), name, avatar, progress: emptyProgress() };
    setProfiles(prev => {
      const updated = [...prev, newProfile];
      persistProfiles(updated, newProfile.id);
      return updated;
    });
    setActiveProfileIdState(newProfile.id);
    try { localStorage.setItem(ACTIVE_PROFILE_KEY, newProfile.id); } catch { /* ignore */ }
  }, []);

  const removeProfile = useCallback((id: string) => {
    setProfiles(prev => {
      if (prev.length <= 1) return prev;
      const updated = prev.filter(p => p.id !== id);
      const newActiveId = id === activeProfileId ? updated[0].id : activeProfileId;
      persistProfiles(updated, newActiveId);
      if (id === activeProfileId) setActiveProfileIdState(updated[0].id);
      return updated;
    });
  }, [activeProfileId]);

  const updateProfileName = useCallback((id: string, name: string) => {
    setProfiles(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, name } : p);
      persistProfiles(updated, activeProfileId);
      return updated;
    });
  }, [activeProfileId]);

  const updateProfileAvatar = useCallback((id: string, avatar: string) => {
    setProfiles(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, avatar } : p);
      persistProfiles(updated, activeProfileId);
      return updated;
    });
  }, [activeProfileId]);

  const updateActiveProgress = useCallback((progress: UserProgress) => {
    setProfiles(prev => {
      const updated = prev.map(p => p.id === activeProfileId ? { ...p, progress } : p);
      persistProfiles(updated, activeProfileId);
      return updated;
    });
  }, [activeProfileId]);

  const value = useMemo<ProfileContextValue>(() => ({
    profiles,
    activeProfileId,
    activeProfile,
    setActiveProfileId,
    addProfile,
    removeProfile,
    updateProfileName,
    updateProfileAvatar,
    updateActiveProgress,
  }), [profiles, activeProfileId, activeProfile, setActiveProfileId, addProfile, removeProfile, updateProfileName, updateProfileAvatar, updateActiveProgress]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
};

export const useProfile = (): ProfileContextValue => {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
};
