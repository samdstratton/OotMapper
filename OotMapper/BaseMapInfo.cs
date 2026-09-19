using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json;
using OotMapper.Model;

namespace OotMapper
{
	public class BaseMapInfo
	{
		public static readonly string DefaultCfgFile = "../../oot.basemap.json";

		[JsonProperty("Segments")]
		private Dictionary<string, MapSegment> _segments = new Dictionary<string, MapSegment>();

		public MapSegment GetSegment(string id) {
			return _segments[id];
		}

		public string[] AllIds() {
			return _segments.Keys.ToArray();
		}

		public Entrance GetEntrance(string id) {
			foreach (KeyValuePair<string, MapSegment> segEntry in _segments) {
				foreach (KeyValuePair<string, Entrance> enEntry in segEntry.Value.Entrances) {
					if (enEntry.Key == id) {
						return enEntry.Value;
					}
				}
			}
			throw new KeyNotFoundException($"Entrance '{id}' not found in basemap.");
		}

		public string EntranceParent(string entranceId) {
			foreach (KeyValuePair<string, MapSegment> entry in _segments) {
				if (entry.Value.Entrances.Keys.Contains(entranceId)) {
					return entry.Key;
				}
			}
			throw new KeyNotFoundException($"Entrance '{entranceId}' not found in basemap.");
		}

		public static BaseMapInfo FromFile(string file) {
			return JsonConvert.DeserializeObject<BaseMapInfo>(File.ReadAllText(file));
		}

		public void SaveToFile(string file) {
			File.WriteAllText(file, JsonConvert.SerializeObject(this, Formatting.Indented));
		}

		public static BaseMapInfo LoadDefault() {
			return FromFile(DefaultCfgFile);
		}
	}
}
