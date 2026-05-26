import os
import logging
from flask import Flask, jsonify, request
from flask_cors import CORS
from neo4j import GraphDatabase
from dotenv import load_dotenv

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load .env
# Search for .env in current dir, backend/ dir, or root dir
env_paths = [
    os.path.join(os.path.dirname(__file__), '.env'),
    os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'),
    '.env'
]

for path in env_paths:
    if os.path.exists(path):
        load_dotenv(path)
        logger.info(f"Loaded .env from {path}")
        break
else:
    load_dotenv()
    logger.info("Loaded .env from environment or default location")

app = Flask(__name__)
# CORS configuration
CORS(app, supports_credentials=True)

# Configuration
MEMGRAPH_HOST = os.getenv('MEMGRAPH_HOST', 'localhost')
MEMGRAPH_PORT = os.getenv('MEMGRAPH_PORT', '7687')
MEMGRAPH_USER = os.getenv('MEMGRAPH_USER', '')
MEMGRAPH_PASSWORD = os.getenv('MEMGRAPH_PASSWORD', '')
DEFAULT_OWNER = os.getenv('DEFAULT_OWNER', 'thtesche')

# Neo4j Driver
driver = None
try:
    # Explicitly check if we have the necessary config
    logger.info(f"Connecting to Memgraph at {MEMGRAPH_HOST}:{MEMGRAPH_PORT} (User: {MEMGRAPH_USER})")
    driver = GraphDatabase.driver(
        f"bolt://{MEMGRAPH_HOST}:{MEMGRAPH_PORT}",
        auth=(MEMGRAPH_USER, MEMGRAPH_PASSWORD) if MEMGRAPH_USER else None
    )
    # Try a quick connectivity test
    driver.verify_connectivity()
    logger.info("Successfully connected to Memgraph")
except Exception as e:
    logger.error(f"Failed to create or verify driver: {e}")


import urllib.request
import urllib.parse
import json
import time

CACHE_FILE = os.path.join(os.path.dirname(__file__), 'session_cache.json')

def load_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return {}

def save_cache(cache):
    try:
        with open(CACHE_FILE, 'w') as f:
            json.dump(cache, f)
    except Exception as e:
        logger.error(f"Failed to save cache: {e}")

def get_user_from_sid(sid):
    if not sid:
        return None
    cache = load_cache()
    if sid in cache:
        session = cache[sid]
        if session.get('expires', 0) > time.time():
            return session.get('account')
        else:
            del cache[sid]
            save_cache(cache)
    return None

def set_user_sid(sid, account):
    cache = load_cache()
    cache[sid] = {
        'account': account,
        'expires': time.time() + 14 * 24 * 60 * 60 # 14 days
    }
    save_cache(cache)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "message": "GraphStation Backend is running"})

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    if not data or 'account' not in data or 'passwd' not in data:
        return jsonify({"success": False, "error": {"code": 400, "message": "Missing credentials"}}), 400
    
    payload = {
        'api': 'SYNO.API.Auth',
        'version': '7',
        'method': 'login',
        'account': data['account'],
        'passwd': data['passwd'],
        'format': 'sid',
        'enable_syno_token': 'yes'
    }
    if 'otp_code' in data and data['otp_code']:
        payload['otp_code'] = data['otp_code']
        
    encoded_data = urllib.parse.urlencode(payload).encode('utf-8')
    synology_url = os.getenv('SYNOLOGY_URL')
    
    if synology_url:
        url = f'{synology_url.rstrip("/")}/webapi/auth.cgi'
    else:
        dsm_host = os.getenv('GRAPHSTATION_HOST', 'localhost')
        dsm_port = os.getenv('DSM_PORT', '5000')
        url = f'http://{dsm_host}:{dsm_port}/webapi/auth.cgi'
    
    try:
        req = urllib.request.Request(url, data=encoded_data, method='POST')
        with urllib.request.urlopen(req, timeout=10) as response:
            res_body = response.read()
            res_json = json.loads(res_body)
            if res_json.get('success') and 'data' in res_json:
                sid = res_json['data'].get('sid')
                account = res_json['data'].get('account')
                if sid and account:
                    set_user_sid(sid, account)
            return jsonify(res_json)
    except Exception as e:
        logger.error(f"Failed to authenticate with NAS: {e}")
        return jsonify({"success": False, "error": {"code": 500, "message": str(e)}}), 500

@app.route('/filters', methods=['GET'])
def get_filters():
    sid = request.cookies.get('sid')
    username = get_user_from_sid(sid)
    
    if not username:
        logger.warning("Unauthorized access attempt to /filters")
        return jsonify({"error": "Unauthorized"}), 401

    if not driver:
        return jsonify({"error": "Database driver not initialized"}), 500

    try:
        with driver.session() as session:
            query = """
            MATCH (u:Owner {name: $username})<-[:OWNED_BY]-(p:Photo)
            OPTIONAL MATCH (p)-[:HAS_PERSON]->(pe:Person)
            OPTIONAL MATCH (pe)-[:BELONGS_TO_FAMILY]->(f:Family)
            WITH collect(DISTINCT f.name) as families, collect(DISTINCT pe.name) as persons, u
            OPTIONAL MATCH (u)<-[:OWNED_BY]-(p2:Photo)-[:LOCATED_AT]->(l:Location)
            WITH DISTINCT l, families, persons
            OPTIONAL MATCH (l)-[:PART_OF*0..10]->(c:Country)
            WHERE c.type = "Country"
            RETURN families, persons, collect(DISTINCT c.name) as countries
            """
            result = session.run(query, username=username)
            record = result.single()
            if record:
                data = record.data()
                return jsonify({
                    "families": sorted([x for x in data.get("families", []) if x]),
                    "persons": sorted([x for x in data.get("persons", []) if x]),
                    "countries": sorted([x for x in data.get("countries", []) if x])
                })
            return jsonify({"families": [], "persons": [], "countries": []})
    except Exception as e:
        logger.error(f"Filters Query Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/photos', methods=['GET'])
def get_photos():
    sid = request.cookies.get('sid')
    username = get_user_from_sid(sid)
    
    if not username:
        logger.warning("Unauthorized access attempt to /photos")
        return jsonify({"error": "Unauthorized"}), 401

    logger.info(f"Fetching photos for user: {username}")

    if not driver:
        return jsonify({"error": "Database driver not initialized. Check server logs for connection errors."}), 500

    family = request.args.get('family')
    person = request.args.get('person')
    country = request.args.get('country')

    try:
        with driver.session() as session:
            query = """
            MATCH (p:Photo)-[:OWNED_BY]->(u:Owner {name: $username})
            """
            params = {"username": username}
            
            if family:
                query += " MATCH (p)-[:HAS_PERSON]->(:Person)-[:BELONGS_TO_FAMILY]->(f:Family {name: $family})"
                params["family"] = family
            if person:
                query += " MATCH (p)-[:HAS_PERSON]->(pe:Person {name: $person})"
                params["person"] = person
            if country:
                query += " MATCH (p)-[:LOCATED_AT]->(:Location)-[:PART_OF*0..10]->(c:Country {name: $country}) WHERE c.type = 'Country'"
                params["country"] = country
                
            query += """
            RETURN DISTINCT p.id AS id, p.cache_key AS cache_key, p.takentime AS takentime
            ORDER BY p.takentime DESC
            LIMIT 50
            """
            result = session.run(query, **params)

            photos = [record.data() for record in result]
            return jsonify({
                "owner": username,
                "photos": photos
            })
    except Exception as e:
        logger.error(f"Query Error: {e}")
        return jsonify({
            "error": "Database Query Failed",
            "details": str(e)
        }), 500

@app.route('/photo/<photo_id>/details', methods=['GET'])
def get_photo_details(photo_id):
    sid = request.cookies.get('sid')
    username = get_user_from_sid(sid)
    
    if not username:
        return jsonify({"error": "Unauthorized"}), 401

    if not driver:
        return jsonify({"error": "Database driver not initialized"}), 500

    try:
        try:
            db_photo_id = int(photo_id)
        except ValueError:
            db_photo_id = photo_id

        with driver.session() as session:
            query = """
            MATCH (u:Owner {name: $username})<-[:OWNED_BY]-(p:Photo {id: $photo_id})
            OPTIONAL MATCH (p)-[:HAS_PERSON]->(pe:Person)
            OPTIONAL MATCH (pe)-[:BELONGS_TO_FAMILY]->(f:Family)
            OPTIONAL MATCH (f)-[:BELONGS_TO_FAMILY]-(all_pe:Person)
            RETURN pe.name AS person_in_photo, f.name AS family_name, collect(DISTINCT all_pe.name) AS family_members
            """
            result = session.run(query, username=username, photo_id=db_photo_id)
            
            data = [record.data() for record in result]
            
            families = {}
            persons_in_photo = set()
            
            for row in data:
                p_name = row.get("person_in_photo")
                f_name = row.get("family_name")
                members = row.get("family_members", [])
                
                if p_name:
                    persons_in_photo.add(p_name)
                    
                if f_name:
                    if f_name not in families:
                        families[f_name] = set(members)
                    else:
                        families[f_name].update(members)
            
            families_list = [
                {"name": fname, "members": sorted(list(members))}
                for fname, members in families.items()
            ]
            
            return jsonify({
                "persons_in_photo": sorted(list(persons_in_photo)),
                "families": families_list
            })
            
    except Exception as e:
        logger.error(f"Query Error: {e}")
        return jsonify({"error": "Database Query Failed", "details": str(e)}), 500


@app.route('/photos/grouped', methods=['GET'])
def get_grouped_photos():
    sid = request.cookies.get('sid')
    username = get_user_from_sid(sid)
    
    if not username:
        logger.warning("Unauthorized access attempt to /photos/grouped")
        return jsonify({"error": "Unauthorized"}), 401

    group_by = request.args.get('by', 'family') # 'family', 'person', 'location'
    
    if not driver:
        return jsonify({"error": "Database driver not initialized"}), 500

    try:
        with driver.session() as session:
            if group_by == 'family':
                query = """
                MATCH (u:Owner {name: $username})<-[:OWNED_BY]-(p:Photo)-[:HAS_PERSON]->(pe:Person)-[:BELONGS_TO_FAMILY]->(f:Family)
                WHERE f.name IS NOT NULL AND trim(f.name) <> ""
                RETURN f.name as group_name, collect(DISTINCT {id: p.id, cache_key: p.cache_key, takentime: p.takentime}) as photos
                ORDER BY group_name
                """
            elif group_by == 'person':
                query = """
                MATCH (u:Owner {name: $username})<-[:OWNED_BY]-(p:Photo)-[:HAS_PERSON]->(pe:Person)
                WHERE pe.name IS NOT NULL AND trim(pe.name) <> ""
                RETURN pe.name as group_name, collect(DISTINCT {id: p.id, cache_key: p.cache_key, takentime: p.takentime}) as photos
                ORDER BY group_name
                """
            elif group_by == 'location':
                query = """
                MATCH (u:Owner {name: $username})<-[:OWNED_BY]-(p:Photo)-[:LOCATED_AT]->(l:Location)
                 WITH l, collect(DISTINCT {id: p.id, cache_key: p.cache_key, takentime: p.takentime}) as photos
                 OPTIONAL MATCH path = (l)-[:PART_OF*0..10]->(c:Country)
                 WHERE c.type = "Country"
                 WITH photos, l, c, [n in nodes(path) WHERE n.type = "State"][0] as s
                WITH photos,
                     CASE WHEN c.name IS NOT NULL AND trim(c.name) <> "" THEN trim(c.name) ELSE null END as cn,
                     CASE WHEN s.name IS NOT NULL AND trim(s.name) <> "" THEN trim(s.name) ELSE null END as sn,
                     CASE WHEN l.name IS NOT NULL AND trim(l.name) <> "" THEN trim(l.name) ELSE null END as ln
                WITH photos, cn,
                     CASE WHEN sn = cn THEN null ELSE sn END as sn,
                     ln
                WITH photos,
                     CASE
                       WHEN cn IS NOT NULL AND sn IS NOT NULL THEN cn + " - " + sn
                       ELSE COALESCE(cn, sn, ln, "Unbekannter Ort")
                     END as loc_name
                UNWIND photos as photo
                RETURN loc_name as group_name, collect(DISTINCT photo) as photos
                ORDER BY group_name
                """
            else:
                return jsonify({"error": "Invalid grouping field"}), 400

            result = session.run(query, username=username)
            grouped_data = []
            for record in result:
                photos = record['photos']
                # Sort photos by takentime DESC
                photos.sort(key=lambda x: x.get('takentime') or 0, reverse=True)
                grouped_data.append({
                    "group_name": record['group_name'],
                    "photos": photos
                })
            return jsonify(grouped_data)
    except Exception as e:
        logger.error(f"Grouped Query Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/graph', methods=['GET'])
def get_graph():
    sid = request.cookies.get('sid')
    username = get_user_from_sid(sid)
    
    if not username:
        logger.warning("Unauthorized access attempt to /graph")
        return jsonify({"error": "Unauthorized"}), 401

    limit = request.args.get('limit', 20, type=int)
    
    if not driver:
        return jsonify({"error": "Database driver not initialized"}), 500

    try:
        with driver.session() as session:
            # Query to get photos and their immediate connections
            query = """
            MATCH (u:Owner {name: $username})<-[:OWNED_BY]-(p:Photo)
            WITH p ORDER BY p.takentime DESC LIMIT $limit
            OPTIONAL MATCH (p)-[r]-(m)
            WHERE NOT m:Owner
            RETURN p, r, m
            """
            result = session.run(query, username=username, limit=limit)
            
            nodes = {}
            links = []
            
            for record in result:
                p = record['p']
                r = record['r']
                m = record['m']
                
                # Add Photo node
                p_id = f"photo_{p.element_id}"
                if p_id not in nodes:
                    nodes[p_id] = {
                        "id": p_id,
                        "label": p.get('filename', 'Photo'),
                        "type": "Photo",
                        "cache_key": p.get('cache_key'),
                        "unit_id": p.get('id'),
                        "takentime": p.get('takentime'),
                        "val": 5 # Node size
                    }

                
                # Add related node and link
                if m is not None:
                    m_label = list(m.labels)[0] if m.labels else "Unknown"
                    m_id = f"{m_label.lower()}_{m.element_id}"
                    if m_id not in nodes:
                        nodes[m_id] = {
                            "id": m_id,
                            "label": m.get('name') or m.get('filename') or m_label,
                            "type": m_label,
                            "val": 3
                        }
                    
                    if r is not None:
                        links.append({
                            "source": p_id,
                            "target": m_id,
                            "type": r.type
                        })

            
            return jsonify({
                "nodes": list(nodes.values()),
                "links": links
            })
    except Exception as e:
        logger.error(f"Graph Query Error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':

    app.run(host='0.0.0.0', port=5000, debug=True)

