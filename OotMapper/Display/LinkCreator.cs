using OotMapper.Model;

namespace OotMapper.Display
{
	public class LinkCreator
	{
		private string _source;

		private bool _inProgress;
		private Layout _layout;

		public LinkCreator(Layout layout) {
			_layout = layout;
			_inProgress = false;
		}

		public bool Add(string enId) {
			if (!_inProgress) {
				_source = enId;
				_inProgress = true;
			} else {
				Finalise(new Link(_source, enId));
				_inProgress = false;
			}
			return !_inProgress;
		}

		private void Finalise(Link link) {
			if (_layout.Links.Contains(link)) {
				_layout.Links.Remove(link);
				return;
			}

			if (link.Source == link.Dest) {
				return;
			}

			_layout.Links.Add(link);
		}

		public void Cancel() {
			_inProgress = false;
		}
	}
}
