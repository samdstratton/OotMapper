using System.Collections.Generic;
using System.Windows;
using Newtonsoft.Json;

namespace OotMapper.Model
{
	public class MapSegment
	{
		[JsonProperty("Size")]
		public Size Size { get; set; }
		[JsonProperty("Entrances")]
		public Dictionary<string, Entrance> Entrances { get; set; }
	}
}
