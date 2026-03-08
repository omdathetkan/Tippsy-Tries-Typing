import React, { useEffect, useRef, useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useProfile } from '../contexts/ProfileContext';
import { useI18n } from '../hooks/useI18n';
import { useSound } from '../hooks/useSound';
import { Home, Download, Upload, Trash2, Info, AlertTriangle, X, Plus, Pencil, Check } from 'lucide-react';
import { UserProgress, GameStats } from '../types';
import { MAX_SUB_LEVELS } from '../constants';
import { emptyProgress } from '../contexts/ProfileContext';

const PROFILE_EMOJIS = [
  '🐱','🐶','🦊','🐼','🐨','🦁','🐯','🐸',
  '🐧','🦉','🐙','🦋','🦄','🦖','🤖','👻',
  '🎃','🧸','🌟','🔥','⚡','💎','🎮','🎸',
  '🚀','🏆','🌈','🍕','🌺','🎯','🧩','🦦',
  '🐬','🦚','🦝','🎪',
];

/** Validate and normalize parsed JSON to UserProgress; return null if invalid. */
function parseProgressJson(raw: unknown): UserProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const us = typeof p.unlockedStageId === 'number' ? p.unlockedStageId : null;
  const ul = typeof p.unlockedSubLevelId === 'number' ? p.unlockedSubLevelId : null;
  if (us == null || ul == null) return null;
  const st = p.stats && typeof p.stats === 'object' ? (p.stats as Record<string, unknown>) : null;
  if (!st) return null;
  const totalCharsTyped = typeof st.totalCharsTyped === 'number' ? st.totalCharsTyped : 0;
  const totalTimePlayed = typeof st.totalTimePlayed === 'number' ? st.totalTimePlayed : 0;
  const gamesPlayed = typeof st.gamesPlayed === 'number' ? st.gamesPlayed : 0;
  const highestWpm = typeof st.highestWpm === 'number' ? st.highestWpm : 0;
  const averageWpm = typeof st.averageWpm === 'number' ? st.averageWpm : 0;
  const averageAccuracy = typeof st.averageAccuracy === 'number' ? st.averageAccuracy : 0;
  const stats = { totalCharsTyped, totalTimePlayed, gamesPlayed, highestWpm, averageWpm, averageAccuracy };
  const rawLastSessionByKey = p.lastSessionByKey && typeof p.lastSessionByKey === 'object' ? (p.lastSessionByKey as Record<string, unknown>) : {};
  const lastSessionByKey: Record<string, GameStats> = {};
  for (const [k, v] of Object.entries(rawLastSessionByKey)) {
    if (v && typeof v === 'object' && typeof (v as GameStats).wpm === 'number' && typeof (v as GameStats).accuracy === 'number' && typeof (v as GameStats).errors === 'number' && typeof (v as GameStats).totalChars === 'number' && typeof (v as GameStats).timeElapsed === 'number') {
      lastSessionByKey[k] = v as GameStats;
    }
  }
  const sessionHistory = Array.isArray(p.sessionHistory) ? p.sessionHistory : [];
  const perStageBest = p.perStageBest && typeof p.perStageBest === 'object' ? (p.perStageBest as Record<string, unknown>) : {};
  const errorCountByChar = p.errorCountByChar && typeof p.errorCountByChar === 'object' ? (p.errorCountByChar as Record<string, number>) : {};
  return {
    unlockedStageId: Math.max(1, Math.floor(us)),
    unlockedSubLevelId: Math.max(1, Math.min(MAX_SUB_LEVELS, Math.floor(ul))),
    stats,
    lastSessionByKey,
    sessionHistory,
    perStageBest,
    errorCountByChar
  };
}

interface SettingsProps {
  onBack: () => void;
}

const Settings: React.FC<SettingsProps> = ({ onBack }) => {
  const { language, keyboardLayout, soundEnabled, zeroMistakesMode, setLanguage, setKeyboardLayout, setSoundEnabled, setZeroMistakesMode } = useSettings();
  const { profiles, activeProfile, activeProfileId, addProfile, removeProfile, updateProfileName, updateProfileAvatar, updateActiveProgress } = useProfile();
  const { t } = useI18n();
  const { playMenuClick } = useSound();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showDeleteConfirmId, setShowDeleteConfirmId] = useState<string | null>(null);

  // Profile name editing state
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');

  // Emoji picker state
  const [showEmojiPickerForId, setShowEmojiPickerForId] = useState<string | null>(null);

  // Add-profile form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileAvatar, setNewProfileAvatar] = useState('🐶');

  // ── Profile handlers ────────────────────────────────────────────────────────

  const handleStartEditName = (id: string, currentName: string) => {
    setEditingNameId(id);
    setEditingNameValue(currentName);
  };

  const handleCommitName = () => {
    if (editingNameId && editingNameValue.trim()) {
      updateProfileName(editingNameId, editingNameValue.trim());
    }
    setEditingNameId(null);
  };

  const handlePickAvatar = (id: string, emoji: string) => {
    updateProfileAvatar(id, emoji);
    setShowEmojiPickerForId(null);
  };

  const handleAddProfile = () => {
    const name = newProfileName.trim() || `Player ${profiles.length + 1}`;
    addProfile(name, newProfileAvatar);
    setNewProfileName('');
    setNewProfileAvatar('🐶');
    setShowAddForm(false);
  };

  const handleDeleteProfile = (id: string) => {
    if (profiles.length <= 1) return;
    removeProfile(id);
    setShowDeleteConfirmId(null);
  };

  // ── Data handlers ────────────────────────────────────────────────────────────

  const handleExport = () => {
    playMenuClick();
    try {
      const json = JSON.stringify(activeProfile.progress);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tippsy-progress-${activeProfile.name.replace(/\s+/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  const handleImportClick = () => {
    playMenuClick();
    fileInputRef.current?.click();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(reader.result as string);
        const progress = parseProgressJson(raw);
        if (!progress) {
          alert(t('settings.importError'));
          return;
        }
        updateActiveProgress(progress);
        window.location.reload();
      } catch {
        alert(t('settings.importError'));
      }
    };
    reader.readAsText(file);
  };

  const handleResetClick = () => {
    playMenuClick();
    setShowResetModal(true);
  };

  const handleResetConfirm = () => {
    playMenuClick();
    updateActiveProgress(emptyProgress());
    setShowResetModal(false);
    window.location.reload();
  };

  const handleResetCancel = () => {
    playMenuClick();
    setShowResetModal(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        playMenuClick();
        if (showResetModal) {
          setShowResetModal(false);
        } else if (showEmojiPickerForId) {
          setShowEmojiPickerForId(null);
        } else if (editingNameId) {
          setEditingNameId(null);
        } else if (showDeleteConfirmId) {
          setShowDeleteConfirmId(null);
        } else if (showAddForm) {
          setShowAddForm(false);
        } else {
          onBack();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack, playMenuClick, showResetModal, showEmojiPickerForId, editingNameId, showDeleteConfirmId, showAddForm]);

  return (
    <div className="flex-1 container mx-auto px-4 py-8 max-w-3xl flex flex-col h-full">
      <div className="flex items-center gap-4 mb-10">
        <button onClick={() => { playMenuClick(); onBack(); }} className="p-3 hover:bg-slate-800 rounded-full transition-colors group" title={t('settings.back')}>
          <Home size={24} className="text-slate-400 group-hover:text-white" />
        </button>
        <h1 className="text-3xl font-bold text-white">{t('settings.title')}</h1>
      </div>
      <p className="text-slate-500 text-xs mb-8">{t('statistics.escHint')}</p>
      
      {/* ── Profiles section ─────────────────────────────────────────────────── */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 mb-8">
        <h2 className="text-lg font-bold text-white mb-6">{t('profiles.title')}</h2>

        <div className="flex flex-col gap-3">
          {profiles.map(profile => (
            <div
              key={profile.id}
              className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
                profile.id === activeProfileId
                  ? 'border-emerald-500/60 bg-emerald-500/8'
                  : 'border-slate-700 bg-slate-800/50'
              }`}
            >
              {/* Avatar button */}
              <div className="relative">
                <button
                  onClick={() => setShowEmojiPickerForId(
                    showEmojiPickerForId === profile.id ? null : profile.id
                  )}
                  className="text-4xl w-14 h-14 flex items-center justify-center rounded-2xl bg-slate-700/60 hover:bg-slate-600/70 transition-colors border border-slate-600/50 hover:border-slate-500 leading-none"
                  title={t('profiles.pickAvatar')}
                  aria-label={t('profiles.pickAvatar')}
                  style={{ lineHeight: 1 }}
                >
                  {profile.avatar}
                </button>

                {/* Emoji picker popover */}
                {showEmojiPickerForId === profile.id && (
                  <div className="absolute left-0 top-full mt-2 z-50 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-3 w-[224px]">
                    <div className="grid grid-cols-6 gap-1.5">
                      {PROFILE_EMOJIS.map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => handlePickAvatar(profile.id, emoji)}
                          className={`text-2xl w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-slate-700 ${
                            profile.avatar === emoji ? 'bg-emerald-500/20 ring-1 ring-emerald-500' : ''
                          }`}
                          style={{ lineHeight: 1 }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Name — editable inline */}
              <div className="flex-1 min-w-0">
                {editingNameId === profile.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={editingNameValue}
                      onChange={e => setEditingNameValue(e.target.value)}
                      onBlur={handleCommitName}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); handleCommitName(); }
                        if (e.key === 'Escape') { e.preventDefault(); setEditingNameId(null); }
                      }}
                      maxLength={24}
                      className="flex-1 bg-slate-800 text-white rounded-lg px-3 py-1.5 text-sm border border-emerald-500/50 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      onMouseDown={e => { e.preventDefault(); handleCommitName(); }}
                      className="p-1.5 text-emerald-400 hover:text-emerald-300"
                      aria-label="Save"
                    >
                      <Check size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white truncate">{profile.name}</span>
                    {profile.id === activeProfileId && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 shrink-0">
                        {t('profiles.activeLabel')}
                      </span>
                    )}
                    <button
                      onClick={() => handleStartEditName(profile.id, profile.name)}
                      className="p-1 text-slate-500 hover:text-slate-300 transition-colors shrink-0"
                      title={t('profiles.editName') ?? 'Edit name'}
                      aria-label={t('profiles.editName') ?? 'Edit name'}
                    >
                      <Pencil size={13} />
                    </button>
                  </div>
                )}
                <p className="text-slate-500 text-xs mt-0.5">
                  {profile.progress.stats.gamesPlayed} {t('statistics.gamesPlayedSub')} · {profile.progress.stats.totalCharsTyped.toLocaleString()} {t('menu.characters')}
                </p>
              </div>

              {/* Delete button */}
              {profiles.length > 1 && (
                <div className="shrink-0">
                  {showDeleteConfirmId === profile.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDeleteProfile(profile.id)}
                        className="px-2 py-1 text-xs rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30 transition-colors font-medium"
                      >
                        {t('profiles.deleteProfile')}
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirmId(null)}
                        className="p-1 text-slate-400 hover:text-white"
                        aria-label={t('settings.resetCancel')}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowDeleteConfirmId(profile.id)}
                      className="p-2 text-slate-600 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
                      title={t('profiles.deleteProfile')}
                      aria-label={t('profiles.deleteProfile')}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add-profile form */}
        {showAddForm ? (
          <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 rounded-xl border border-slate-700 bg-slate-800/50">
            {/* Avatar picker for new profile */}
            <div className="relative">
              <button
                onClick={() => setShowEmojiPickerForId(
                  showEmojiPickerForId === '__new__' ? null : '__new__'
                )}
                className="text-4xl w-14 h-14 flex items-center justify-center rounded-2xl bg-slate-700/60 hover:bg-slate-600/70 transition-colors border border-slate-600/50 leading-none"
                title={t('profiles.pickAvatar')}
                style={{ lineHeight: 1 }}
              >
                {newProfileAvatar}
              </button>
              {showEmojiPickerForId === '__new__' && (
                <div className="absolute left-0 top-full mt-2 z-50 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-3 w-[224px]">
                  <div className="grid grid-cols-6 gap-1.5">
                    {PROFILE_EMOJIS.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => { setNewProfileAvatar(emoji); setShowEmojiPickerForId(null); }}
                        className={`text-2xl w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-slate-700 ${
                          newProfileAvatar === emoji ? 'bg-emerald-500/20 ring-1 ring-emerald-500' : ''
                        }`}
                        style={{ lineHeight: 1 }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <input
              autoFocus
              placeholder={t('profiles.namePlaceholder')}
              value={newProfileName}
              onChange={e => setNewProfileName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); handleAddProfile(); }
                if (e.key === 'Escape') { e.preventDefault(); setShowAddForm(false); }
              }}
              maxLength={24}
              className="flex-1 bg-slate-700 text-white rounded-xl px-4 py-2.5 text-sm border border-slate-600 focus:outline-none focus:border-emerald-500 w-full sm:w-auto"
            />

            <div className="flex gap-2">
              <button
                onClick={handleAddProfile}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-sm transition-colors"
              >
                {t('profiles.add')}
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-3 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:text-white text-sm transition-colors"
              >
                {t('profiles.cancel')}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { playMenuClick(); setShowAddForm(true); }}
            className="mt-4 flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-slate-600 text-slate-400 hover:text-white hover:border-slate-400 transition-colors text-sm w-full justify-center"
          >
            <Plus size={16} />
            <span>{t('profiles.addProfile')}</span>
          </button>
        )}
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 mb-8">
        <h2 className="text-lg font-bold text-white mb-2">{t('settings.language')}</h2>
        <p className="text-slate-400 text-sm mb-6">{t('settings.languageHint')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            onClick={() => setLanguage('en')}
            className={`px-4 py-3 rounded-xl border transition-all text-left ${language === 'en' ? 'border-emerald-500 bg-emerald-500/10 text-white' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            <div className="font-bold">{t('settings.english')}</div>
            <div className="text-xs text-slate-400">English</div>
          </button>
          <button
            onClick={() => setLanguage('de')}
            className={`px-4 py-3 rounded-xl border transition-all text-left ${language === 'de' ? 'border-emerald-500 bg-emerald-500/10 text-white' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            <div className="font-bold">{t('settings.german')}</div>
            <div className="text-xs text-slate-400">Deutsch</div>
          </button>
          <button
            onClick={() => setLanguage('nl')}
            className={`px-4 py-3 rounded-xl border transition-all text-left ${language === 'nl' ? 'border-emerald-500 bg-emerald-500/10 text-white' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            <div className="font-bold">{t('settings.dutch')}</div>
            <div className="text-xs text-slate-400">Nederlands</div>
          </button>
        </div>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 mb-8">
        <h2 className="text-lg font-bold text-white mb-2">{t('settings.keyboard')}</h2>
        <p className="text-slate-400 text-sm mb-6">{t('settings.keyboardHint')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => setKeyboardLayout('qwerty')}
            className={`px-4 py-3 rounded-xl border transition-all text-left ${keyboardLayout === 'qwerty' ? 'border-emerald-500 bg-emerald-500/10 text-white' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            <div className="font-bold">{t('settings.qwerty')}</div>
            <div className="text-xs text-slate-400">QWERTY</div>
          </button>
          <button
            onClick={() => setKeyboardLayout('qwertz')}
            className={`px-4 py-3 rounded-xl border transition-all text-left ${keyboardLayout === 'qwertz' ? 'border-emerald-500 bg-emerald-500/10 text-white' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            <div className="font-bold">{t('settings.qwertz')}</div>
            <div className="text-xs text-slate-400">QWERTZ</div>
          </button>
        </div>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 mb-8">
        <h2 className="text-lg font-bold text-white mb-2">{t('settings.sound')}</h2>
        <p className="text-slate-400 text-sm mb-6">{t('settings.soundHint')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => setSoundEnabled(true)}
            className={`px-4 py-3 rounded-xl border transition-all text-left ${soundEnabled ? 'border-emerald-500 bg-emerald-500/10 text-white' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            <div className="font-bold">{t('settings.soundOn')}</div>
            <div className="text-xs text-slate-400">{t('settings.sound')}</div>
          </button>
          <button
            onClick={() => setSoundEnabled(false)}
            className={`px-4 py-3 rounded-xl border transition-all text-left ${!soundEnabled ? 'border-emerald-500 bg-emerald-500/10 text-white' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            <div className="font-bold">{t('settings.soundOff')}</div>
            <div className="text-xs text-slate-400">{t('settings.sound')}</div>
          </button>
        </div>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 mb-8">
        <h2 className="text-lg font-bold text-white mb-2">{t('settings.zeroMistakes')}</h2>
        <p className="text-slate-400 text-sm mb-6">{t('settings.zeroMistakesHint')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={() => setZeroMistakesMode(true)}
            className={`px-4 py-3 rounded-xl border transition-all text-left ${zeroMistakesMode ? 'border-emerald-500 bg-emerald-500/10 text-white' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            <div className="font-bold">{t('settings.soundOn')}</div>
            <div className="text-xs text-slate-400">{t('settings.zeroMistakes')}</div>
          </button>
          <button
            onClick={() => setZeroMistakesMode(false)}
            className={`px-4 py-3 rounded-xl border transition-all text-left ${!zeroMistakesMode ? 'border-emerald-500 bg-emerald-500/10 text-white' : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
          >
            <div className="font-bold">{t('settings.soundOff')}</div>
            <div className="text-xs text-slate-400">{t('settings.zeroMistakes')}</div>
          </button>
        </div>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-lg font-bold text-white mb-2">{t('settings.data')}</h2>
        <p className="text-slate-400 text-sm mb-6">{t('settings.exportHint')}</p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all"
          >
            <Download size={18} />
            <span>{t('settings.export')}</span>
          </button>
          <button
            onClick={handleImportClick}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all"
          >
            <Upload size={18} />
            <span>{t('settings.import')}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>
        <p className="text-slate-500 text-xs mt-4">{t('settings.importHint')}</p>
        <hr className="border-slate-700 my-6" />
        <p className="text-slate-400 text-sm mb-3">{t('settings.resetHint')}</p>
        <button
          onClick={handleResetClick}
          className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-red-900/50 bg-red-950/30 text-red-300 hover:bg-red-900/30 transition-all"
        >
          <Trash2 size={18} />
          <span>{t('settings.reset')}</span>
        </button>
      </div>

      <div className="mt-8 p-4 rounded-xl bg-slate-800/60 border border-slate-700 flex gap-3">
        <Info size={20} className="text-slate-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-slate-300 text-sm font-medium mb-1">
            <kbd className="px-1.5 py-0.5 rounded bg-slate-700 font-mono text-xs">{t('settings.skipLevelShortcut')}</kbd>
          </p>
          <p className="text-slate-500 text-xs">{t('settings.skipLevelHint')}</p>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm transition-opacity duration-300"
          onClick={handleResetCancel}
        >
          <style>{`
            @keyframes modal-enter {
              from { opacity: 0; transform: scale(0.95) translateY(10px); }
              to { opacity: 1; transform: scale(1) translateY(0); }
            }
            .animate-modal-enter {
              animation: modal-enter 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
          `}</style>
          <div 
            className="bg-[#0f1623] border border-red-500/30 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden relative animate-modal-enter"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-red-900/40 to-orange-900/40 p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/20 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>
              
              <div className="flex justify-between items-start relative z-10">
                <div className="p-3 bg-gradient-to-tr from-red-500 to-orange-500 rounded-xl shadow-lg inline-flex">
                  <AlertTriangle className="w-8 h-8 text-white" />
                </div>
                <button 
                  onClick={handleResetCancel}
                  className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                  aria-label={t('settings.back')}
                >
                  <X size={20} />
                </button>
              </div>
              
              <h2 className="mt-5 text-2xl font-bold text-white">{t('settings.reset')}</h2>
              <p className="text-red-300 text-sm font-medium uppercase tracking-wider mt-1">{t('settings.resetHint')}</p>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              <p className="text-slate-300 text-base leading-relaxed">
                {t('settings.resetConfirm')}
              </p>
              
              <div className="flex gap-3">
                <button 
                  onClick={handleResetCancel}
                  className="flex-1 py-3 px-4 border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 font-medium rounded-xl transition-all"
                >
                  {t('settings.resetCancel')}
                </button>
                <button 
                  onClick={handleResetConfirm}
                  className="flex-1 py-3 px-4 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-bold rounded-xl shadow-lg shadow-red-900/20 transition-all transform hover:scale-[1.02] active:scale-[0.98] border border-red-500/20"
                >
                  {t('settings.resetConfirmButton')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
