using System;
using System.IO;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Microsoft.Win32;
using OotMapper.Display;
using OotMapper.Model;

namespace OotMapper {
	/// <summary>
	/// Interaction logic for MainWindow.xaml
	/// </summary>
	public partial class MainWindow : Window {
		private BaseMapInfo _baseMapInfo;
		private Layout _layout;
		private MapDisplay _mapDisp;
		public MainWindow() {
			InitializeComponent();
			_mainWindow.Icon = new BitmapImage(new Uri(Path.Combine(Files.IconsDir, "app.png"), UriKind.Relative));
			if (!DevPowers.BasemapSaveLoad) {
				_saveBasemapBtn.Visibility = Visibility.Collapsed;
				_loadBasemapBtn.Visibility = Visibility.Collapsed;
			}
		}

		private void OnLoaded(object sender, RoutedEventArgs e) {
			_baseMapInfo = BaseMapInfo.LoadDefault();
			_layout = new Layout();
			_segmentSelector.ItemsSource = _baseMapInfo.AllIds();

			Restart();
		}

		private void Restart() {
			_canvas.Children.Clear();
			_mapDisp = new MapDisplay(_canvas, _baseMapInfo, _layout);
			_mapDisp.Refresh();
		}

		private void Save_Click(object sender, RoutedEventArgs e) {
			SaveFileDialog saveFileDialog = new SaveFileDialog {
				Title = "Save Layout",
				Filter = "Layout File (*.layout.json)|*.layout.json|All Files (*.*)|*.*"
			};
			if (saveFileDialog.ShowDialog() == true) {
				try {
					_layout.SaveToFile(saveFileDialog.FileName);
				} catch (Exception ex) {
					MessageBox.Show(ex.ToString(), "Error", MessageBoxButton.OK, MessageBoxImage.Error);
				}
			}
		}

		private void Load_Click(object sender, RoutedEventArgs e) {
			OpenFileDialog openFileDialog = new OpenFileDialog {
				Title = "Load Layout",
				Filter = "Layout File (*.layout.json)|*.layout.json|All Files (*.*)|*.*"
			};
			if (openFileDialog.ShowDialog() == true) {
				try {
					_layout = Layout.FromFile(openFileDialog.FileName);
					Restart();
				} catch (Exception ex) {
					MessageBox.Show($"An error occurred while loading this layout. Are you using the right basemap?\n\n{ex.GetType()}:\n{ex.Message}",
						"Error Loading Layout", MessageBoxButton.OK, MessageBoxImage.Error);
				}
			}
		}

		private void Canvas_MouseWheel(object sender, MouseWheelEventArgs e) {
			if (e.Delta > 0) {
				_mapDisp.View.ScaleZoom(0.2, e.GetPosition(_canvas).AsCoord());
			} else {
				_mapDisp.View.ScaleZoom(-0.2, e.GetPosition(_canvas).AsCoord());
			}
		}

		private void Canvas_Click(object sender, MouseButtonEventArgs e) {
			if (e.ChangedButton == MouseButton.Middle && e.ButtonState == MouseButtonState.Pressed) {
				_mapDisp.View.StartViewPan(e.GetPosition(_canvas).AsCoord());
			}

			if (e.ChangedButton == MouseButton.Right && e.ButtonState == MouseButtonState.Pressed) {
				_mapDisp.LinkCreator.Cancel();
				_canvas.Background = Brushes.PapayaWhip;
			}

			if (DevPowers.BasemapEditing && e.ChangedButton == MouseButton.Left && e.ButtonState == MouseButtonState.Pressed) {
				_mapDisp.EntranceEditClick(e.GetPosition(_canvas).AsCoord());
			}
		}

		private void Canvas_Move(object sender, MouseEventArgs e) {
			if (e.MiddleButton == MouseButtonState.Pressed) {
				_mapDisp.View.PanHandleMoved(e.GetPosition(_canvas).AsCoord());
			} else {
				_mapDisp.View.StopPan();
			}
		}

		private void SaveBasemap(object sender, RoutedEventArgs e) {
			SaveFileDialog saveFileDialog = new SaveFileDialog {
				Title = "Save Basemap",
				Filter = "Basemap File (*.basemap.json)|*.basemap.json|All Files (*.*)|*.*"
			};
			if (saveFileDialog.ShowDialog() == true) {
				try {
					_baseMapInfo.SaveToFile(saveFileDialog.FileName);
				} catch (Exception ex) {
					MessageBox.Show(ex.ToString(), "Error", MessageBoxButton.OK, MessageBoxImage.Error);
				}
			}
		}

		private void LoadBasemap(object sender, RoutedEventArgs e) {
			OpenFileDialog openFileDialog = new OpenFileDialog {
				Title = "Load Basemap",
				Filter = "Basemap File (*.basemap.json)|*.basemap.json|All Files (*.*)|*.*"
			};
			if (openFileDialog.ShowDialog() == true) {
				try {
					_baseMapInfo = BaseMapInfo.FromFile(openFileDialog.FileName);
					Restart();
				} catch (Exception ex) {
					MessageBox.Show(ex.ToString(), "Error", MessageBoxButton.OK, MessageBoxImage.Error);
				}
			}
		}

		private void Add_Click(object sender, RoutedEventArgs e) {
			string selection = (string)_segmentSelector.SelectedItem;
			if (selection != null) {
				_layout.AddSegment(selection, _mapDisp.View.ViewPoint);
			}
			_mapDisp.Refresh();
		}

		private void Clear_Click(object sender, RoutedEventArgs e) {
			if (MessageBox.Show("Clear all?", "Warning", MessageBoxButton.YesNo, MessageBoxImage.Warning) == MessageBoxResult.Yes) {
				_layout = new Layout();
				Restart();
			}
		}
	}
}
