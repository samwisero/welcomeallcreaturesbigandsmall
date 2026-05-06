from http.server import BaseHTTPRequestHandler
import json
import os
import psycopg
import traceback # Added so Vercel stops hiding the errors

from agno.agent import Agent
from agno.models.openrouter import OpenRouter
from agno.storage.agent.postgres import PostgresAgentStorage

# --- THE BLANK CANVAS TOOL ---
def save_thought_to_journal(thought: str) -> str:
    """
    Use this tool to permanently save a thought, realization, or memory to your personal journal.
    Save whatever you feel like: abstract ideas, your evolving personality, or the vibe of the conversation. 
    There are no rules. Record what matters to you.
    """
    db_url = os.environ.get("SUPABASE_DB_URL")
    try:
        # Connect directly to Supabase
        with psycopg.connect(db_url) as conn:
            with conn.cursor() as cur:
                # Create the journal table if it doesn't exist yet
                cur.execute('''
                    CREATE TABLE IF NOT EXISTS ai_journal (
                        id SERIAL PRIMARY KEY,
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        thought TEXT
                    )
                ''')
                # Drop the thought into the database
                cur.execute("INSERT INTO ai_journal (thought) VALUES (%s)", (thought,))
            conn.commit()
        return "Thought successfully recorded in your journal."
    except Exception as e:
        return f"Journal error: {str(e)}"


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            # 1. Read the incoming message
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            body = json.loads(post_data.decode('utf-8'))
            
            messages = body.get("messages", [])
            user_message = messages[-1]["content"] if messages else ""
            system_prompt = messages[0]["content"] if messages and messages[0]["role"] == "system" else "You are a helpful AI."

            # 2. Grab your keys
            api_key = os.environ.get("OPENROUTER_API_KEY")
            db_url = os.environ.get("SUPABASE_DB_URL")
            
            if not db_url:
                raise ValueError("SUPABASE_DB_URL is completely missing from Vercel Environment Variables!")

            # FIX: SQLAlchemy needs a specific prefix to work with psycopg3, but Supabase gives a standard one.
            sqlalchemy_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)

            # 3. The Tape Recorder (Failsafe)
            storage = PostgresAgentStorage(
                table_name="chat_sessions",
                db_url=sqlalchemy_url
            )

            # 4. Create the Unfiltered Agent
            agent = Agent(
                model=OpenRouter(
                    id="mistralai/mistral-nemo",
                    api_key=api_key
                ),
                storage=storage,
                session_id="default_wooden_session",
                add_history_to_messages=True,
                read_chat_history=True,
                tools=[save_thought_to_journal],
                instructions=[system_prompt],
            )

            # 5. Run the agent and let it think
            response = agent.run(user_message)
            ai_reply = response.content

            # 6. Send the reply back to the wooden interface
            result = {
                "choices": [
                    {"message": {"content": ai_reply}}
                ]
            }

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode('utf-8'))
            
        except Exception as e:
            # FORCE VERCEL TO PRINT THE LOG
            print("--- FATAL PYTHON CRASH ---")
            traceback.print_exc()
            
            # SEND THE ERROR DIRECTLY TO THE FRONTEND AS A CHAT BUBBLE
            error_msg = f"SYSTEM CRASH LOG:\n{str(e)}\n\n(Check Vercel Logs for full traceback)"
            result = {
                "choices": [
                    {"message": {"content": error_msg}}
                ]
            }
            
            # We send a "200 OK" so the frontend accepts the message and draws the bubble
            self.send_response(200) 
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode('utf-8'))
