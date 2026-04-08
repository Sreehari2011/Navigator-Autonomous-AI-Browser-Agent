from typing import TypedDict, List, Optional, Dict, Any

class ElementDescriptor(TypedDict):
    uid: str
    role: str
    name: str
    selector: str
    bbox: Dict[str, float]
    center: Dict[str, float]
    attributes: Dict[str, str]
    score: float

class PageContext(TypedDict):
    url: str
    title: str
    domain: str
    viewport: Dict[str, int]
    interactive_count: int
    timestamp: str

class ActionDecision(TypedDict):
    action: str
    uid: Optional[str]
    value: Optional[str]
    thought: str
    verification: Dict[str, Any]