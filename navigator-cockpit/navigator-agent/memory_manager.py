import chromadb
import uuid
import json
import logging

class MemoryManager:
    """Manages persistent storage of successful workflows"""
    
    def __init__(self):
        try:
            self.client = chromadb.PersistentClient(path="./agent_memory_db")
            self.collection = self.client.get_or_create_collection(name="workflow_history")
            logging.info("Memory system initialized")
        except Exception as e:
            logging.warning(f"Memory system unavailable: {e}")
            self.client = None
            self.collection = None

    def add_experience(self, goal, steps, success=True):
        """
        Saves a successful workflow to memory.
        
        Args:
            goal: The objective that was accomplished
            steps: List of action descriptions
            success: Whether the task succeeded
        """
        if not self.collection or not success:
            return
        
        try:
            doc_content = json.dumps({"goal": goal, "steps": steps})
            
            self.collection.add(
                documents=[doc_content],
                metadatas=[{"goal": goal}],
                ids=[str(uuid.uuid4())]
            )
            
            logging.info(f"MEMORY: Saved successful workflow for: '{goal}'")
        except Exception as e:
            logging.warning(f"Failed to save to memory: {e}")

    def retrieve_experience(self, current_goal):
        """
        Finds the most similar past successful task.
        
        Returns:
            List of steps from a similar past task, or None
        """
        if not self.collection:
            return None
        
        try:
            results = self.collection.query(
                query_texts=[current_goal],
                n_results=1
            )

            if results['documents'] and results['documents'][0]:
                best_match_json = results['documents'][0][0]
                data = json.loads(best_match_json)
                logging.info(f"MEMORY: Found similar past experience")
                return data['steps']
            
            return None
        except Exception as e:
            logging.warning(f"Memory retrieval failed: {e}")
            return None