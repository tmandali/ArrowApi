import { useEffect } from 'react';
import { skillsManager, Skill } from '@my-agent/core';

/**
 * React bileşeni veya ekran düzeyinde deklaratif Pi Skill tanımlama hook'u.
 * Bileşen mount olduğunda skill'i kaydeder, unmount olduğunda (ekrandan çıkıldığında) otomatik kaldırır.
 */
export function useAgentSkill(skill: Skill) {
  useEffect(() => {
    skillsManager.registerSkill(skill);
    return () => {
      skillsManager.unregisterSkill(skill.name);
    };
  }, [
    skill.name,
    skill.description,
    skill.instructions,
    skill.requiresApproval,
    skill.riskLevel,
    JSON.stringify(skill.requiredFields),
    JSON.stringify(skill.applicableRoutes),
    JSON.stringify(skill.applicableComponents),
    JSON.stringify(skill.metadata),
  ]);
}
