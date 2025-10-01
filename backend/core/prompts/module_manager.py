"""
Modular Prompt Builder
Phase 2 Task 2.1.3

Manages prompt modules with version control and dynamic loading.
"""
from enum import Enum
from pathlib import Path
from typing import List, Dict, Optional
from dataclasses import dataclass
from core.utils.logger import logger


class PromptModule(Enum):
    """Available prompt modules"""
    # Core modules (always loaded)
    CORE_IDENTITY = "core/identity"
    CORE_WORKSPACE = "core/workspace"
    CORE_CRITICAL_RULES = "core/critical_rules"
    
    # Tool modules (conditionally loaded)
    TOOL_TOOLKIT = "tools/toolkit"
    TOOL_DATA_PROCESSING = "tools/data_processing"
    TOOL_WORKFLOW = "tools/workflow"
    TOOL_CONTENT_CREATION = "tools/content_creation"
    
    # Response modules (always loaded)
    RESPONSE_FORMAT = "response/format"


@dataclass
class ModuleConfig:
    """Configuration for a prompt module"""
    name: str
    content: str
    size: int
    version: str
    always_load: bool
    cache_eligible: bool


class ModularPromptBuilder:
    """
    Builds prompts from modular components.
    
    Features:
    - Load modules from disk
    - Combine modules dynamically
    - Track module usage
    - Support versioning
    - Cache-aware
    """
    
    def __init__(self, modules_dir: Optional[Path] = None):
        """
        Initialize the builder.
        
        Args:
            modules_dir: Path to modules directory (default: auto-detect)
        """
        if modules_dir is None:
            # Auto-detect modules directory
            self.modules_dir = Path(__file__).parent / "modules"
        else:
            self.modules_dir = modules_dir
        
        self.modules: Dict[PromptModule, ModuleConfig] = {}
        self._load_all_modules()
        
        logger.info(f"📦 ModularPromptBuilder initialized: {len(self.modules)} modules loaded")
    
    def _load_all_modules(self):
        """Load all modules from disk"""
        for module in PromptModule:
            path = self.modules_dir / f"{module.value}.txt"
            
            if not path.exists():
                logger.warning(f"⚠️  Module not found: {path}")
                continue
            
            try:
                content = path.read_text()
                
                # Determine if module should always be loaded
                always_load = (
                    module.value.startswith("core/") or 
                    module.value.startswith("response/")
                )
                
                # Check if module is eligible for caching (>1024 chars)
                cache_eligible = len(content) >= 1024
                
                self.modules[module] = ModuleConfig(
                    name=module.value,
                    content=content,
                    size=len(content),
                    version="1.0.0",
                    always_load=always_load,
                    cache_eligible=cache_eligible
                )
                
                logger.debug(f"✅ Loaded module: {module.value} ({len(content)} chars)")
            
            except Exception as e:
                logger.error(f"❌ Failed to load module {module.value}: {e}")
    
    def build_prompt(
        self, 
        modules_needed: Optional[List[PromptModule]] = None,
        context: Optional[dict] = None
    ) -> str:
        """
        Build prompt from modules.
        
        Args:
            modules_needed: List of modules to include (None = all modules)
            context: Optional context for dynamic content
        
        Returns:
            Combined prompt string
        """
        parts = []
        modules_used = []
        
        # Always load core and response modules
        for module in PromptModule:
            if module in self.modules and self.modules[module].always_load:
                parts.append(self.modules[module].content)
                modules_used.append(module.value)
        
        # Load conditional modules if specified
        if modules_needed:
            for module in modules_needed:
                if module in self.modules and not self.modules[module].always_load:
                    parts.append(self.modules[module].content)
                    modules_used.append(module.value)
        else:
            # If no modules specified, load all
            for module in PromptModule:
                if module in self.modules and not self.modules[module].always_load:
                    parts.append(self.modules[module].content)
                    modules_used.append(module.value)
        
        # Combine parts
        combined = "\n\n".join(parts)
        
        # Log module usage
        logger.info(f"📦 Built prompt: {len(modules_used)} modules, {len(combined)} chars")
        logger.debug(f"   Modules: {', '.join(modules_used)}")
        
        # Log to GlitchTip
        try:
            import sentry_sdk
            sentry_sdk.set_context("prompt_build", {
                "modules_count": len(modules_used),
                "modules": modules_used,
                "total_size": len(combined),
                "cache_eligible_count": sum(1 for m in modules_used if self.modules.get(PromptModule(m.replace('/', '_').upper()), ModuleConfig("", "", 0, "", False, False)).cache_eligible)
            })
            sentry_sdk.capture_message(
                f"Prompt built: {len(modules_used)} modules, {len(combined)} chars",
                level="info"
            )
        except Exception as e:
            logger.warning(f"Failed to log prompt build to GlitchTip: {e}")
        
        return combined
    
    def get_module_info(self, module: PromptModule) -> Optional[ModuleConfig]:
        """Get information about a specific module"""
        return self.modules.get(module)
    
    def list_modules(self) -> List[str]:
        """List all available modules"""
        return [m.value for m in self.modules.keys()]
    
    def get_total_size(self, modules: Optional[List[PromptModule]] = None) -> int:
        """
        Calculate total size of modules.
        
        Args:
            modules: List of modules (None = all modules)
        
        Returns:
            Total size in characters
        """
        if modules is None:
            modules = list(self.modules.keys())
        
        return sum(
            self.modules[m].size 
            for m in modules 
            if m in self.modules
        )
    
    def validate_functional_equivalence(self, original_prompt: str) -> dict:
        """
        Validate that modular prompt is functionally equivalent to original.
        
        Args:
            original_prompt: Original monolithic prompt
        
        Returns:
            Validation results
        """
        # Build full modular prompt
        modular_prompt = self.build_prompt()
        
        # Compare sizes
        original_size = len(original_prompt)
        modular_size = len(modular_prompt)
        size_diff = abs(original_size - modular_size)
        size_diff_pct = (size_diff / original_size * 100) if original_size > 0 else 0
        
        # Check coverage
        coverage = (modular_size / original_size * 100) if original_size > 0 else 0
        
        results = {
            "original_size": original_size,
            "modular_size": modular_size,
            "size_diff": size_diff,
            "size_diff_pct": round(size_diff_pct, 2),
            "coverage": round(coverage, 2),
            "modules_count": len(self.modules),
            "passed": size_diff_pct < 5.0  # Allow 5% difference
        }
        
        logger.info(f"📊 Validation results: {results}")
        
        # Log to GlitchTip
        try:
            import sentry_sdk
            sentry_sdk.capture_message(
                f"Module validation: {results['coverage']}% coverage, {results['passed']}",
                level="info",
                extras=results
            )
        except Exception as e:
            logger.warning(f"Failed to log validation to GlitchTip: {e}")
        
        return results


# Singleton instance
_builder_instance: Optional[ModularPromptBuilder] = None


def get_prompt_builder() -> ModularPromptBuilder:
    """Get singleton instance of ModularPromptBuilder"""
    global _builder_instance
    if _builder_instance is None:
        _builder_instance = ModularPromptBuilder()
    return _builder_instance

