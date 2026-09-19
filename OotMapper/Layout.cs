using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using OotMapper.Types;

namespace OotMapper.Model
{
	public class Layout
	{
		public static readonly string DefaultMapFile = "../../vanilla.layout.json";

		[JsonProperty("Positions")]
		private Dictionary<string, Coord> Positions;
		[JsonProperty("Links")]
		public List<Link> Links;

		[JsonIgnore]
		public List<string> CurrentSegments => Positions.Keys.ToList();

		public Layout() :
			this(new Dictionary<string, Coord>(), new List<Link>()) {
		}

		public Layout(Dictionary<string, Coord> positions, List<Link> links) {
			Positions = positions;
			Links = links;
		}

		public bool AddSegment(string id, Coord position) {
			if (!Positions.ContainsKey(id)) {
				Positions.Add(id, position);
				return true;
			}
			return false;
		}
		public void AddSegment(string id, double x, double y) {
			AddSegment(id, new Coord(x, y));
		}

		public Coord GetSegmentPos(string segmentId) {
			return Positions[segmentId];
		}

		public void SetSegmentPos(string segmentId, Coord newPos) {
			Positions[segmentId] = newPos;
		}

		// File Save/Load
		public static Layout FromFile(string file) {
			Layout map = JsonConvert.DeserializeObject<Layout>(File.ReadAllText(file));
			return map;
		}

		public void SaveToFile(string file) {
			File.WriteAllText(file, JsonConvert.SerializeObject(this, Formatting.Indented));
		}

		public static Layout LoadDefault() {
			return FromFile(DefaultMapFile);
		}
	}
}
