"use client";

import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Home, Package, BookOpen } from "lucide-react";

export default function WireframeNavigation() {
  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 font-bold text-xl text-sky-700"
          >
            <BookOpen className="w-6 h-6" />
            Wireframe Showcase
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="hidden md:flex gap-6 text-sm font-medium"
          >
            <Button variant="ghost" href="/wireframe" className="flex items-center gap-2">
              <Home className="w-4 h-4" />
              Ana Sayfa
            </Button>
            <Button variant="ghost" href="/wireframe/pinokyo" className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              Pinokyo
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex gap-3"
          >
            <Button variant="outline" size="icon">
              <BookOpen className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon">
              <Package className="w-4 h-4" />
            </Button>
          </motion.div>
        </div>
      </div>
    </nav>
  );
}