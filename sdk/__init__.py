"""
Epsilon SDK for Chainlens AI Worker Platform

A Python SDK for creating and managing AI Workers with thread execution capabilities.
"""

__version__ = "0.1.0"

from .epsilon.epsilon import Epsilon
from .epsilon.tools import AgentPressTools, MCPTools

__all__ = ["Epsilon", "AgentPressTools", "MCPTools"]
