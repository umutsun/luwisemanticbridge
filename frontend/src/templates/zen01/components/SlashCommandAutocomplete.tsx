'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import type { SlashCommand, SlashCommandSubmenuItem } from '../types';

interface SlashCommandAutocompleteProps {
  isOpen: boolean;
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (command: SlashCommand, submenuItem?: SlashCommandSubmenuItem) => void;
  onClose: () => void;
}

/**
 * SlashCommandAutocomplete
 * Minimal dropdown for slash commands with submenu support
 */
export const SlashCommandAutocomplete: React.FC<SlashCommandAutocompleteProps> = ({
  isOpen,
  commands,
  selectedIndex,
  onSelect,
  onClose,
}) => {
  const [expandedCommand, setExpandedCommand] = useState<string | null>(null);
  const [submenuIndex, setSubmenuIndex] = useState(0);

  if (!isOpen || commands.length === 0) return null;

  const handleCommandClick = (cmd: SlashCommand) => {
    if (cmd.hasSubmenu && cmd.submenuItems) {
      setExpandedCommand(expandedCommand === cmd.id ? null : cmd.id);
      setSubmenuIndex(0);
    } else {
      onSelect(cmd);
    }
  };

  const handleSubmenuClick = (cmd: SlashCommand, item: SlashCommandSubmenuItem) => {
    onSelect(cmd, item);
    setExpandedCommand(null);
  };

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
            <div key={cmd.id}>
              <div
                onClick={() => handleCommandClick(cmd)}
                className={`zen01-slash-command-item ${idx === selectedIndex ? 'selected' : ''}`}
              >
                <span className="zen01-slash-command-trigger">{cmd.trigger}</span>
                <span className="zen01-slash-command-label">{cmd.label}</span>
                {cmd.hasSubmenu && (
                  <ChevronRight className={`h-4 w-4 ml-auto transition-transform ${expandedCommand === cmd.id ? 'rotate-90' : ''}`} />
                )}
              </div>

              {/* Submenu */}
              <AnimatePresence>
                {cmd.hasSubmenu && expandedCommand === cmd.id && cmd.submenuItems && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                    className="zen01-slash-submenu"
                  >
                    {cmd.submenuItems.map((item, subIdx) => (
                      <div
                        key={item.id}
                        onClick={() => handleSubmenuClick(cmd, item)}
                        className={`zen01-slash-submenu-item ${subIdx === submenuIndex ? 'selected' : ''}`}
                      >
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SlashCommandAutocomplete;
