using Newtonsoft.Json;

namespace OotMapper.Model
{
	public class Link
	{
		[JsonProperty("Source")]
		public string Source { get; }
		[JsonProperty("Dest")]
		public string Dest { get; }

		[JsonIgnore]
		public string Id => GetId(Source, Dest);

		public Link(string source, string dest) {
			Source = source;
			Dest = dest;
		}

		public static string GetId(string source, string dest) {
			return source.GetHashCode() < dest.GetHashCode() ? $"{source} <=> {dest}" : $"{dest} <=> {source}";
		}

		public override bool Equals(object obj) {
			if (obj is Link other) {
				return Id == other.Id;
			}
			return false;
		}

		public override int GetHashCode() {
			return Id.GetHashCode();
		}
	}
}
