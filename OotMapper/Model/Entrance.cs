using Newtonsoft.Json;
using OotMapper.Types;

namespace OotMapper.Model
{
	public class Entrance
	{
		[JsonProperty("EnType")]
		public EntranceType EnType { get; set; }
		[JsonProperty("FractionCoords")]
		public Coord FractionCoords { get; set; }

		public Entrance(EntranceType enType, Coord fractionCoords) {
			EnType = enType;
			FractionCoords = fractionCoords;
		}
	}
}
