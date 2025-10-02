"""
Semantic Prompt Router
Phase 3.2 - Optional Upgrade

Uses semantic similarity for intelligent module selection.

Author: Winston (Architect)
Date: 2025-10-01
"""

from typing import List, Dict
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import structlog

from .router import DynamicPromptRouter, PromptModule

logger = structlog.get_logger(__name__)


class SemanticPromptRouter(DynamicPromptRouter):
    """
    Semantic similarity-based router.
    
    Upgrades keyword-based routing with semantic understanding.
    Falls back to keyword matching if semantic fails.
    
    Performance:
    - Model: all-MiniLM-L6-v2 (90MB)
    - Routing time: 50-100ms
    - Accuracy: 40-50% cost reduction (vs 21.1% keyword-based)
    """
    
    def __init__(self, model_name: str = 'all-MiniLM-L6-v2'):
        """
        Initialize semantic router.
        
        Args:
            model_name: SentenceTransformer model to use
        """
        super().__init__()
        
        # Load semantic model
        logger.info(f"🧠 Loading SentenceTransformer model: {model_name}")
        self.model = SentenceTransformer(model_name)
        
        # Compute module embeddings
        self.module_embeddings = self._compute_module_embeddings()
        
        logger.info(f"🧠 SemanticPromptRouter initialized with {model_name}")
    
    def _compute_module_embeddings(self) -> Dict[PromptModule, np.ndarray]:
        """
        Compute embeddings for each module.
        
        Returns:
            Dictionary mapping modules to embeddings
        """
        # OPTION 4: Fine-tuned rich descriptions for better semantic matching
        module_descriptions = {
            PromptModule.TOOL_TOOLKIT:
                # File operations
                "file operations: create file, edit file, read file, write file, delete file, "
                "list files, move file, copy file, rename file, find file, search files, "
                "file permissions, file size, file exists, file structure, directory operations, "
                "folder management, path operations, symbolic links, file compression, archive, "
                # Web browsing
                "web browsing: navigate web, search web, fetch url, download file, upload file, "
                "scrape website, web content, http requests, api calls, "
                # Terminal & system
                "terminal commands: shell commands, execute command, run script, bash, zsh, "
                "system operations, process management, environment variables, "
                # Visual & media
                "screenshots: capture screen, take screenshot, image operations, visual content, "
                "media files, image processing, thumbnails",

            PromptModule.TOOL_DATA_PROCESSING:
                # Data formats
                "data processing: parse data, extract data, transform data, clean data, "
                "csv files, json data, xml data, yaml data, excel files, spreadsheets, "
                # Database operations
                "database: query database, sql, database operations, data storage, "
                "tables, records, database migration, backup database, "
                # Data analysis
                "data analysis: analyze data, statistics, metrics, aggregation, "
                "filter data, sort data, group data, join data, merge data, "
                # Data transformation
                "data transformation: convert format, reshape data, pivot data, "
                "normalize data, encode data, serialize data, compress data, "
                # Data quality
                "data quality: validate data, check integrity, deduplicate, "
                "handle missing values, outliers, anomalies",

            PromptModule.TOOL_WORKFLOW:
                # Task management
                "task management: organize tasks, create tasks, schedule tasks, "
                "prioritize work, track progress, manage deadlines, todo lists, "
                # Project management
                "project management: project setup, project planning, roadmap, timeline, "
                "milestones, sprints, backlog, agile, scrum, kanban, "
                # Workflow & processes
                "workflow: define workflow, process steps, automation, pipeline, "
                "ci/cd, continuous integration, deployment pipeline, "
                # Development operations
                "development: initialize project, bootstrap, scaffold, setup environment, "
                "configure settings, install dependencies, build project, compile, "
                # Deployment & infrastructure
                "deployment: deploy application, release version, rollback, "
                "infrastructure, provision resources, scale services, load balancing, "
                # Monitoring & maintenance
                "monitoring: monitor metrics, logging, alerts, diagnostics, troubleshooting, "
                "performance optimization, health checks",

            PromptModule.TOOL_CONTENT_CREATION:
                # Writing & composition
                "writing: write content, compose text, draft document, create article, "
                "write blog post, write essay, write story, write script, write copy, "
                # Documentation
                "documentation: write documentation, create readme, write guide, "
                "write tutorial, api documentation, user manual, help docs, "
                # Business content
                "business writing: write report, write proposal, write email, "
                "write letter, write announcement, press release, newsletter, "
                # Marketing content
                "marketing: write marketing content, ad copy, product description, "
                "social media post, tweet, linkedin post, instagram caption, "
                "seo content, landing page, call-to-action, "
                # Creative content
                "creative writing: blog title, headline, meta description, keywords, "
                "captions, alt text, image descriptions, video scripts, podcast notes, "
                # Technical writing
                "technical writing: code comments, docstrings, changelog, release notes, "
                "error messages, tooltips, ui text, form labels, validation messages"
        }
        
        embeddings = {}
        for module, description in module_descriptions.items():
            embedding = self.model.encode(description)
            embeddings[module] = embedding
            logger.debug(f"📊 Computed embedding for {module.value}: shape={embedding.shape}")
        
        logger.info(f"📊 Computed embeddings for {len(embeddings)} modules")
        
        return embeddings
    
    def route(self, user_query: str, threshold: float = 0.3, use_hybrid: bool = True) -> List[PromptModule]:
        """
        Route query using semantic similarity with hybrid keyword fallback.

        Args:
            user_query: User's query string
            threshold: Similarity threshold (0-1)
            use_hybrid: If True, combine semantic + keyword results

        Returns:
            List of modules to include
        """
        try:
            # Always include core modules
            modules = [
                PromptModule.CORE_IDENTITY,
                PromptModule.CORE_WORKSPACE,
                PromptModule.CORE_CRITICAL_RULES,
                PromptModule.RESPONSE_FORMAT
            ]

            # Get query embedding
            query_embedding = self.model.encode(user_query)

            # Calculate similarity with each module
            similarities = {}
            semantic_modules = []
            for module, module_embedding in self.module_embeddings.items():
                similarity = cosine_similarity(
                    query_embedding.reshape(1, -1),
                    module_embedding.reshape(1, -1)
                )[0][0]
                similarities[module] = similarity

                if similarity >= threshold:
                    semantic_modules.append(module)
                    logger.debug(
                        f"🎯 Semantic match: {module.value}",
                        similarity=f"{similarity:.3f}",
                        threshold=threshold
                    )

            # Hybrid approach: combine semantic + keyword
            if use_hybrid:
                # Get keyword matches
                keyword_modules = super().route(user_query)
                keyword_tool_modules = [m for m in keyword_modules if m.value.startswith("tools/")]

                # Combine: semantic OR keyword (union)
                all_tool_modules = list(set(semantic_modules + keyword_tool_modules))
                modules.extend(all_tool_modules)

                logger.info(
                    f"🔀 Hybrid routing: {len(semantic_modules)} semantic + {len(keyword_tool_modules)} keyword = {len(all_tool_modules)} total",
                    semantic=[m.value for m in semantic_modules],
                    keyword=[m.value for m in keyword_tool_modules],
                    final=[m.value for m in all_tool_modules]
                )
            else:
                # Pure semantic: use only semantic matches
                modules.extend(semantic_modules)

                # Fallback: if no tool modules selected, use keyword routing
                if not semantic_modules:
                    logger.info("🔄 No semantic matches, falling back to keyword routing")
                    return super().route(user_query)
            
            # Log routing decision
            logger.info(
                f"🧠 Semantic routing: {len(modules)} modules selected",
                query_preview=user_query[:100],
                modules=[m.value for m in modules],
                threshold=threshold,
                top_similarities={
                    m.value: f"{s:.3f}" 
                    for m, s in sorted(
                        similarities.items(), 
                        key=lambda x: x[1], 
                        reverse=True
                    )[:3]
                }
            )
            
            # Log to GlitchTip
            try:
                import sentry_sdk
                sentry_sdk.set_context("semantic_routing", {
                    "query_length": len(user_query),
                    "query_preview": user_query[:200],
                    "modules_selected": [m.value for m in modules],
                    "module_count": len(modules),
                    "similarities": {m.value: float(s) for m, s in similarities.items()},
                    "threshold": threshold
                })
                sentry_sdk.capture_message(
                    f"Semantic routing: {len(modules)} modules, avg similarity {np.mean(list(similarities.values())):.2f}",
                    level="info"
                )
            except Exception as e:
                logger.warning(f"Failed to log semantic routing to GlitchTip: {e}")
            
            return modules
            
        except Exception as e:
            logger.error(f"❌ Semantic routing failed: {e}", exc_info=True)
            
            # Fallback to keyword routing
            logger.info("🔄 Falling back to keyword routing due to error")
            return super().route(user_query)
    
    def analyze_query(self, user_query: str) -> Dict[str, any]:
        """
        Analyze query with semantic information.
        
        Args:
            user_query: User's query string
        
        Returns:
            Analysis results with similarities
        """
        # Get base analysis
        analysis = super().analyze_query(user_query)
        
        # Add semantic information
        query_embedding = self.model.encode(user_query)
        
        similarities = {}
        for module, module_embedding in self.module_embeddings.items():
            similarity = cosine_similarity(
                query_embedding.reshape(1, -1),
                module_embedding.reshape(1, -1)
            )[0][0]
            similarities[module.value] = float(similarity)
        
        analysis["semantic_similarities"] = similarities
        analysis["routing_method"] = "semantic"
        
        return analysis


# Singleton instance
_semantic_router = None


def get_semantic_router() -> SemanticPromptRouter:
    """Get or create semantic router singleton."""
    global _semantic_router
    if _semantic_router is None:
        _semantic_router = SemanticPromptRouter()
    return _semantic_router

