'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SlashCommand } from '../types';

interface SlashCommandAutocompleteProps {
  isOpen: boolean;
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

/**
 * SlashCommandAutocomplete
 * Minimal glassmorphism dropdown for slash commands
 */
export const SlashCommandAutocomplete: React.FC<SlashCommandAutocompleteProps> = ({
  isOpen,
  commands,
  selectedIndex,
  onSelect,
  onClose,
}) => {
  if (!isOpen || commands.length === 0) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="zen01-slash-autocomplete"
        >
          {commands.map((cmd, idx) => (
            <div
              key={cmd.id}
              onClick={() => onSelect(cmd)}
              className={`zen01-slash-command-item ${idx === selectedIndex ? 'selected' : ''}`}
            >
              <span className="zen01-slash-command-icon">{cmd.icon}</span>
              <span className="zen01-slash-command-trigger">{cmd.trigger}</span>
              <span className="zen01-slash-command-label">{cmd.label}</span>
              <span className="zen01-slash-command-desc">{cmd.description}</span>
            </div>
          ))}
          <div className="zen01-slash-command-hint">
            <kbd>↑</kbd><kbd>↓</kbd> navigate <kbd>↵</kbd> select <kbd>esc</kbd> close
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SlashCommandAutocomplete;
