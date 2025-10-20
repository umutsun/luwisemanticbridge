"use client";

import { motion, Variants } from "framer-motion";

// Common motion variants
const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.5 } },
  exit: { opacity: 0, transition: { duration: 0.3 } }
};

const slideUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.3 } }
};

const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.5 } },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.3 } }
};

export const MotionDiv = motion.div;
export const MotionCard = motion.div;
export const MotionButton = motion.button;
export const MotionImage = motion.img;

export const animations = {
  fadeIn,
  slideUp,
  scaleIn
};

export default motion;