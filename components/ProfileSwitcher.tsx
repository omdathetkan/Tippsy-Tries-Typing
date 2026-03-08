import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useProfile } from '../contexts/ProfileContext';
import { useI18n } from '../hooks/useI18n';
import { useSound } from '../hooks/useSound';

interface ProfileSwitcherProps {
  onOpenStats: () => void;
}

const ProfileSwitcher: React.FC<ProfileSwitcherProps> = ({ onOpenStats }) => {
  const { profiles, activeProfile, setActiveProfileId } = useProfile();
  const { t } = useI18n();
  const { playMenuClick } = useSound();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const handleSwitch = (id: string) => {
    if (id === activeProfile.id) {
      setOpen(false);
      return;
    }
    playMenuClick();
    setActiveProfileId(id);
    setOpen(false);
  };

  const handleOpenStats = () => {
    playMenuClick();
    onOpenStats();
  };

  return (
    <div ref={ref} className="relative">
      {/* Compound button: left side → stats, right chevron → dropdown */}
      <div className="flex items-center rounded-full bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 transition-all overflow-hidden">
        <button
          onClick={handleOpenStats}
          className="flex items-center gap-2 pl-3 pr-2 py-2 text-slate-300 hover:text-white"
          title={t('menu.statsTitle')}
          aria-label={t('menu.statsTitle')}
        >
          <span
            className="text-2xl leading-none select-none"
            style={{ lineHeight: 1 }}
            aria-hidden="true"
          >
            {activeProfile.avatar}
          </span>
          <span className="hidden sm:block text-sm font-semibold max-w-[7rem] truncate">
            {activeProfile.name}
          </span>
        </button>

        <button
          onClick={() => { playMenuClick(); setOpen(prev => !prev); }}
          className="pl-1 pr-3 py-2 text-slate-400 hover:text-white border-l border-slate-700/50"
          title={t('profiles.switchProfile')}
          aria-label={t('profiles.switchProfile')}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <ChevronDown
            size={14}
            className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {open && (
        <div
          role="listbox"
          aria-label={t('profiles.switchProfile')}
          className="absolute right-0 mt-2 min-w-[200px] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-[200] overflow-hidden"
          style={{ animation: 'dropdown-enter 0.15s ease-out' }}
        >
          <style>{`
            @keyframes dropdown-enter {
              from { opacity: 0; transform: translateY(-6px) scale(0.97); }
              to   { opacity: 1; transform: translateY(0)   scale(1); }
            }
          `}</style>

          <div className="p-2">
            {profiles.map(profile => (
              <button
                key={profile.id}
                role="option"
                aria-selected={profile.id === activeProfile.id}
                onClick={() => handleSwitch(profile.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                  profile.id === activeProfile.id
                    ? 'bg-emerald-500/15 text-white'
                    : 'hover:bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                <span className="text-2xl leading-none shrink-0" aria-hidden="true">
                  {profile.avatar}
                </span>
                <span className="flex-1 font-medium truncate text-sm">{profile.name}</span>
                {profile.id === activeProfile.id && (
                  <Check size={14} className="text-emerald-400 shrink-0" aria-label={t('profiles.activeLabel')} />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileSwitcher;
