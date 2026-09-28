import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Phone, Check, X, User, Smartphone, ShieldCheck } from 'lucide-react';
import { triggerHaptic } from '../lib/haptics';
import { Language, formatNumber } from '../lib/translations';
import { cleanBangladeshiPhone, formatPhoneDisplay, getBdOperator } from '../lib/phoneUtils';

const OperatorLogo = ({ name, className = "w-4 h-4" }: { name: string; className?: string }) => {
  switch (name) {
    case 'Grameenphone':
      return (
        <svg viewBox="0 0 32 32" className={className} fill="none">
          <circle cx="16" cy="16" r="16" fill="#0099e5" />
          <path d="M16 6C13.5 10 11 14 16 16C16 11 18.5 6 16 6Z" fill="white" />
          <path d="M26 16C22 13.5 18 11 16 16C21 16 26 18.5 26 16Z" fill="white" />
          <path d="M9 22C12.5 20.5 15 18.5 16 16C13.5 14 8 18 9 22Z" fill="white" />
        </svg>
      );
    case 'Robi':
      return (
        <svg viewBox="0 0 32 32" className={className} fill="none">
          <circle cx="16" cy="16" r="16" fill="#e20613" />
          <path d="M16 7L24 16L16 25L8 16Z" fill="#ffde00" />
          <path d="M16 7L24 16H16Z" fill="#ffffff" />
          <path d="M8 16L16 25V16Z" fill="#8b0000" opacity="0.6" />
        </svg>
      );
    case 'Banglalink':
      return (
        <svg viewBox="0 0 32 32" className={className} fill="none">
          <circle cx="16" cy="16" r="16" fill="#ff6600" />
          <path d="M9 22C10 15 15 11 22 9C19 14 16 18 9 22Z" fill="white" />
          <path d="M13 24C16 19 20 15 25 12C23 17 19 21 13 24Z" fill="#ffe600" />
        </svg>
      );
    case 'Airtel':
      return (
        <svg viewBox="0 0 32 32" className={className} fill="none">
          <circle cx="16" cy="16" r="16" fill="#e40000" />
          <path d="M16 9C12 9 9.5 11.5 9.5 15C9.5 19 13.5 22.5 17 22.5C19.5 22.5 21.5 21.2 22 19H19.5C19 19.8 18 20.5 17 20.5C14.5 20.5 12 18.2 12 15C12 12.8 13.8 11 16 11C18 11 19.5 12.5 19.5 15V22.5H22V15C22 11.5 19.5 9 16 9Z" fill="white" />
        </svg>
      );
    case 'Teletalk':
      return (
        <svg viewBox="0 0 32 32" className={className} fill="none">
          <circle cx="16" cy="16" r="16" fill="#008855" />
          <path d="M9 16C9 12 12 9 16 9C20 9 23 12 23 16C23 20 20 23 16 23C13.5 23 11.5 21.8 10.5 20L13 18.5C13.5 19.5 14.5 20.5 16 20.5C18.5 20.5 20.5 18.5 20.5 16C20.5 13.5 18.5 11.5 16 11.5C13.5 11.5 11.5 13.5 11.5 16H14L10.5 20L9 16Z" fill="white" />
          <circle cx="16" cy="16" r="2.5" fill="#ffde00" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 32 32" className={className} fill="none">
          <circle cx="16" cy="16" r="16" fill="#10b981" />
          <path d="M12 10H20V22H12V10Z" stroke="white" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="16" cy="19" r="1" fill="white" />
        </svg>
      );
  }
};

interface ContactNumberPickerModalProps {
  isOpen: boolean;
  contactName: string;
  numbers: string[];
  onSelectNumber: (number: string) => void;
  onClose: () => void;
  lang: Language;
}

export default function ContactNumberPickerModal({
  isOpen,
  contactName,
  numbers,
  onSelectNumber,
  onClose,
  lang
}: ContactNumberPickerModalProps) {
  // Deduplicate and clean all numbers (stripping +88/+880)
  const cleanedNumbers = Array.from(new Set(
    numbers.map(num => cleanBangladeshiPhone(num)).filter(num => num.length > 0)
  ));

  const [selectedNumber, setSelectedNumber] = useState<string>(cleanedNumbers[0] || '');

  // Keep selected number updated when numbers prop changes
  useEffect(() => {
    if (cleanedNumbers.length > 0) {
      setSelectedNumber(cleanedNumbers[0]);
    }
  }, [numbers]);

  // Lock background scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!selectedNumber) return;
    triggerHaptic('single');
    onSelectNumber(selectedNumber);
    onClose();
  };

  const handleSelectCard = (num: string) => {
    triggerHaptic('single');
    setSelectedNumber(num);
  };

  const firstLetter = contactName ? contactName.trim().charAt(0).toUpperCase() : '?';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 no-select overflow-hidden">
        <div className="absolute inset-0" onClick={onClose} />

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.2 }}
          className="bg-white dark:bg-zinc-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col relative z-10"
        >
          {/* Mobile Drag Indicator Bar */}
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-12 h-1.5 bg-zinc-300 dark:bg-zinc-700 rounded-full" />
          </div>

          {/* Modal Header */}
          <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/80 dark:bg-zinc-900/60">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 font-black text-lg flex items-center justify-center shrink-0 border border-emerald-200 dark:border-emerald-800/60 shadow-sm">
                {firstLetter}
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-black text-zinc-900 dark:text-white truncate leading-snug">
                  {contactName || (lang === 'bn' ? 'নির্বাচিত কন্টাক্ট' : 'Selected Contact')}
                </h3>
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Smartphone className="w-3.5 h-3.5" />
                  {lang === 'bn'
                    ? `${formatNumber(cleanedNumbers.length, 'bn')}টি নম্বর পাওয়া গেছে`
                    : `${cleanedNumbers.length} phone numbers found`}
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 rounded-full transition-colors cursor-pointer shrink-0"
              title={lang === 'bn' ? 'বন্ধ করুন' : 'Close'}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Body: Phone Number Cards */}
          <div className="p-5 space-y-3 overflow-y-auto hide-scrollbar">
            <p className="text-xs font-bold text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {lang === 'bn'
                ? 'এই কন্টাক্টে একাধিক নম্বর রয়েছে। আপনি যে নম্বরটি ব্যবহার করতে চান সেটি বেছে নিন (শুধুমাত্র ১টি নম্বর নির্বাচন করা যাবে):'
                : 'Choose the exact phone number to link to this customer (only 1 number can be chosen):'}
            </p>

            <div className="space-y-2.5 pt-1">
              {cleanedNumbers.map((num) => {
                const isSelected = selectedNumber === num;
                const operator = getBdOperator(num);
                const displayFormatted = formatPhoneDisplay(num);

                return (
                  <div
                    key={num}
                    onClick={() => handleSelectCard(num)}
                    className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-emerald-50/80 border-emerald-500 dark:bg-emerald-950/25 dark:border-emerald-500 shadow-md shadow-emerald-500/10'
                        : 'bg-zinc-50 border-zinc-200/80 dark:bg-zinc-950 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    {/* Left: Radio indicator & Phone Details */}
                    <div className="flex items-center gap-3.5 min-w-0">
                      {/* Radio Circle */}
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                        isSelected 
                          ? 'border-emerald-600 bg-emerald-600 dark:border-emerald-500 dark:bg-emerald-500' 
                          : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-white stroke-[3]" />}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-base sm:text-lg font-black text-zinc-900 dark:text-white tracking-wide">
                            {displayFormatted}
                          </span>
                        </div>
                        <div className="text-2xs font-extrabold text-zinc-400 dark:text-zinc-500 mt-0.5 flex items-center gap-1">
                          <Phone className="w-3 h-3 text-zinc-400" />
                          <span>{num}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Operator Badge & Selection Status */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2.5 py-1.5 rounded-xl text-2xs font-extrabold border ${operator.badgeClass} flex items-center gap-1.5 shadow-xs`}>
                        <OperatorLogo name={operator.name} className="w-4 h-4 shrink-0 rounded-full" />
                        <span>{operator.name}</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Modal Footer Actions */}
          <div className="p-5 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-2.5 shrink-0">
            <button
              type="button"
              onClick={handleConfirm}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-2xl text-base shadow-lg shadow-emerald-600/20 cursor-pointer transition-all flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5 stroke-[2.5]" />
              {lang === 'bn' ? 'এই নম্বরটি নির্বাচন করুন' : 'Confirm & Use Number'}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-3 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-850 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold rounded-2xl text-sm cursor-pointer transition-colors"
            >
              {lang === 'bn' ? 'বাতিল' : 'Cancel'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
