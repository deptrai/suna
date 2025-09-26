from .api import agents, threads
from .agent import EpsilonAgent
from .thread import EpsilonThread
from .tools import AgentPressTools, MCPTools


class Epsilon:
    def __init__(self, api_key: str, api_url="https://chainlens.net/api"):
        self._agents_client = agents.create_agents_client(api_url, api_key)
        self._threads_client = threads.create_threads_client(api_url, api_key)

        self.Agent = EpsilonAgent(self._agents_client)
        self.Thread = EpsilonThread(self._threads_client)
